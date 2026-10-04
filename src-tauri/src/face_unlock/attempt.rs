//! Enrolment, unlock and the lockout, as state machines fed with what each
//! frame showed. No camera, no models, no clock: time comes in as
//! milliseconds, so every transition is tested as it is.

use serde::Serialize;

use super::embed::{cosine, mean, Embedding, SAME_PERSON};
use super::liveness::{CLOSER, LARGE_ENOUGH, SLIGHT, STRAIGHT, TURNED};

/// What one frame showed, as far as the state machines care. No pixels.
#[derive(Debug, Clone, PartialEq)]
pub enum Seen {
    NoFace,
    SeveralFaces,
    Face(Face),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Face {
    pub embedding: Embedding,
    /// `liveness::yaw`: positive turned to the person's left.
    pub yaw: f32,
    /// `liveness::size`: the face's width over the frame's.
    pub size: f32,
}

/// What the page asks of the student. It never says whether a face matched.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Prompt {
    LookAtCamera,
    OneFaceOnly,
    ComeCloser,
    TurnLeft,
    TurnRight,
    TurnSlightlyLeft,
    TurnSlightlyRight,
}

// Enrolment ---------------------------------------------------------------

pub const ENROLMENT_FRAMES: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Pose {
    Straight,
    SlightlyLeft,
    SlightlyRight,
}

/// Four frames straight on, then two slightly to each side, so the template
/// knows the face from more than one angle.
const POSES: [Pose; ENROLMENT_FRAMES] = [
    Pose::Straight,
    Pose::Straight,
    Pose::Straight,
    Pose::Straight,
    Pose::SlightlyLeft,
    Pose::SlightlyLeft,
    Pose::SlightlyRight,
    Pose::SlightlyRight,
];

impl Pose {
    fn holds(self, yaw: f32) -> bool {
        match self {
            Pose::Straight => yaw.abs() <= STRAIGHT,
            Pose::SlightlyLeft => (SLIGHT.0..=SLIGHT.1).contains(&yaw),
            Pose::SlightlyRight => (SLIGHT.0..=SLIGHT.1).contains(&-yaw),
        }
    }

    fn prompt(self) -> Prompt {
        match self {
            Pose::Straight => Prompt::LookAtCamera,
            Pose::SlightlyLeft => Prompt::TurnSlightlyLeft,
            Pose::SlightlyRight => Prompt::TurnSlightlyRight,
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Enrolled {
    Going {
        prompt: Prompt,
        taken: usize,
    },
    /// The template: the frames' embeddings averaged.
    Done(Embedding),
}

#[derive(Default)]
pub struct Enrolment {
    taken: Vec<Embedding>,
}

impl Enrolment {
    pub fn prompt(&self) -> Prompt {
        POSES[self.taken.len().min(ENROLMENT_FRAMES - 1)].prompt()
    }

    pub fn frame(&mut self, seen: Seen) -> Enrolled {
        let wanted = POSES[self.taken.len()];
        let going = |prompt, taken| Enrolled::Going { prompt, taken };
        let face = match seen {
            Seen::NoFace => return going(Prompt::LookAtCamera, self.taken.len()),
            Seen::SeveralFaces => return going(Prompt::OneFaceOnly, self.taken.len()),
            Seen::Face(face) => face,
        };
        if face.size < LARGE_ENOUGH {
            return going(Prompt::ComeCloser, self.taken.len());
        }
        if !wanted.holds(face.yaw) {
            return going(wanted.prompt(), self.taken.len());
        }
        // One person: the first good frame says who.
        if let Some(first) = self.taken.first() {
            if cosine(first, &face.embedding) < SAME_PERSON {
                return going(wanted.prompt(), self.taken.len());
            }
        }
        self.taken.push(face.embedding);
        if self.taken.len() < ENROLMENT_FRAMES {
            return going(self.prompt(), self.taken.len());
        }
        match mean(&self.taken) {
            Some(template) => Enrolled::Done(template),
            None => {
                self.taken.clear();
                going(Prompt::LookAtCamera, 0)
            }
        }
    }
}

// Unlock ------------------------------------------------------------------

pub const UNLOCK_MS: u64 = 10_000;
pub const CHALLENGES: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Challenge {
    TurnLeft,
    TurnRight,
    ComeCloser,
}

impl Challenge {
    fn prompt(self) -> Prompt {
        match self {
            Challenge::TurnLeft => Prompt::TurnLeft,
            Challenge::TurnRight => Prompt::TurnRight,
            Challenge::ComeCloser => Prompt::ComeCloser,
        }
    }

    fn met(self, face: &Face, start_size: f32) -> bool {
        match self {
            Challenge::TurnLeft => face.yaw >= TURNED,
            Challenge::TurnRight => face.yaw <= -TURNED,
            Challenge::ComeCloser => face.size >= start_size * CLOSER,
        }
    }
}

/// Two different challenges in one of the six orders, picked by `random`.
pub fn challenges(random: u64) -> [Challenge; CHALLENGES] {
    use Challenge::*;
    const ORDERS: [[Challenge; CHALLENGES]; 6] = [
        [TurnLeft, TurnRight],
        [TurnRight, TurnLeft],
        [TurnLeft, ComeCloser],
        [ComeCloser, TurnLeft],
        [TurnRight, ComeCloser],
        [ComeCloser, TurnRight],
    ];
    ORDERS[(random % ORDERS.len() as u64) as usize]
}

#[derive(Debug, PartialEq)]
pub enum Unlocking {
    Going { prompt: Prompt, done: usize },
    Passed,
    TimedOut,
}

pub struct Unlock {
    template: Embedding,
    challenges: [Challenge; CHALLENGES],
    done: usize,
    /// Set once the current challenge has seen the student straight on: the
    /// face's size then, for "come closer".
    start: Option<f32>,
    started_ms: u64,
    saw_a_face: bool,
}

impl Unlock {
    pub fn new(template: Embedding, challenges: [Challenge; CHALLENGES], now_ms: u64) -> Self {
        Self {
            template,
            challenges,
            done: 0,
            start: None,
            started_ms: now_ms,
            saw_a_face: false,
        }
    }

    /// Whether any frame had a face in it. An attempt given up before that
    /// does not count against the student.
    pub fn saw_a_face(&self) -> bool {
        self.saw_a_face
    }

    /// How alike a face is to the template: a number for the development
    /// log, never the template itself.
    #[cfg(debug_assertions)]
    pub fn likeness(&self, embedding: &Embedding) -> f32 {
        cosine(&self.template, embedding)
    }

    /// Every frame must show the student; one that does not sends the current
    /// challenge back to its start: look straight, then move.
    pub fn frame(&mut self, seen: Seen, now_ms: u64) -> Unlocking {
        if self.done == CHALLENGES {
            return Unlocking::Passed;
        }
        if now_ms.saturating_sub(self.started_ms) >= UNLOCK_MS {
            return Unlocking::TimedOut;
        }
        let current = self.challenges[self.done];
        let face = match seen {
            Seen::NoFace => return self.start_over(Prompt::LookAtCamera),
            Seen::SeveralFaces => return self.start_over(Prompt::OneFaceOnly),
            Seen::Face(face) => face,
        };
        self.saw_a_face = true;
        if face.size < LARGE_ENOUGH {
            return self.start_over(Prompt::ComeCloser);
        }
        if cosine(&self.template, &face.embedding) < SAME_PERSON {
            return self.start_over(Prompt::LookAtCamera);
        }
        let Some(start) = self.start else {
            if face.yaw.abs() <= STRAIGHT {
                self.start = Some(face.size);
                return self.going(current.prompt());
            }
            return self.going(Prompt::LookAtCamera);
        };
        if !current.met(&face, start) {
            return self.going(current.prompt());
        }
        self.done += 1;
        self.start = None;
        if self.done == CHALLENGES {
            Unlocking::Passed
        } else {
            self.going(Prompt::LookAtCamera)
        }
    }

    fn going(&self, prompt: Prompt) -> Unlocking {
        Unlocking::Going {
            prompt,
            done: self.done,
        }
    }

    fn start_over(&mut self, prompt: Prompt) -> Unlocking {
        self.start = None;
        self.going(prompt)
    }
}

// Lockout -----------------------------------------------------------------

pub const TRIES: u8 = 3;
pub const PAUSE_MS: u64 = 5 * 60 * 1000;

/// Three unlocks that failed, and the face is not asked again until the
/// student signs in by hand or five minutes have passed.
#[derive(Debug, Default, PartialEq)]
pub struct Lockout {
    failed: u8,
    since_ms: Option<u64>,
}

impl Lockout {
    pub fn locked(&mut self, now_ms: u64) -> bool {
        match self.since_ms {
            Some(since) if now_ms.saturating_sub(since) < PAUSE_MS => true,
            Some(_) => {
                *self = Self::default();
                false
            }
            None => false,
        }
    }

    pub fn failed(&mut self, now_ms: u64) {
        self.failed = self.failed.saturating_add(1);
        if self.failed >= TRIES && self.since_ms.is_none() {
            self.since_ms = Some(now_ms);
        }
    }

    /// A face that passed, or a sign-in by hand: counting starts afresh.
    pub fn signed_in(&mut self) {
        *self = Self::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::face_unlock::embed::tests::towards;

    fn student() -> Embedding {
        towards(0, 1, 0.1)
    }

    fn stranger() -> Embedding {
        towards(5, 6, 0.1)
    }

    fn face(embedding: Embedding, yaw: f32, size: f32) -> Seen {
        Seen::Face(Face {
            embedding,
            yaw,
            size,
        })
    }

    fn straight() -> Seen {
        face(student(), 0.0, 0.25)
    }

    // Enrolment

    #[test]
    fn enrols_from_four_straight_and_two_slight_turns_each_way() {
        let mut enrolment = Enrolment::default();
        let mut prompts = Vec::new();
        for (i, yaw) in [0.0, 0.05, -0.05, 0.0, 0.2, 0.25, -0.2, -0.25]
            .into_iter()
            .enumerate()
        {
            prompts.push(enrolment.prompt());
            let result = enrolment.frame(face(towards(0, 1 + i % 2, 0.1), yaw, 0.25));
            if i < 7 {
                assert!(
                    matches!(result, Enrolled::Going { taken, .. } if taken == i + 1),
                    "{i}"
                );
            } else {
                let Enrolled::Done(template) = result else {
                    panic!("not done after eight");
                };
                assert!(cosine(&template, &student()) > 0.99);
            }
        }
        use Prompt::*;
        assert_eq!(
            prompts,
            [
                LookAtCamera,
                LookAtCamera,
                LookAtCamera,
                LookAtCamera,
                TurnSlightlyLeft,
                TurnSlightlyLeft,
                TurnSlightlyRight,
                TurnSlightlyRight
            ]
        );
    }

    #[test]
    fn takes_no_frame_that_is_not_good() {
        let mut enrolment = Enrolment::default();
        for (seen, prompt) in [
            (Seen::NoFace, Prompt::LookAtCamera),
            (Seen::SeveralFaces, Prompt::OneFaceOnly),
            (face(student(), 0.0, 0.05), Prompt::ComeCloser),
            (face(student(), 0.3, 0.25), Prompt::LookAtCamera),
        ] {
            assert_eq!(enrolment.frame(seen), Enrolled::Going { prompt, taken: 0 });
        }
        // A turn too far is not a slight one.
        for _ in 0..4 {
            enrolment.frame(straight());
        }
        assert_eq!(
            enrolment.frame(face(student(), 0.6, 0.25)),
            Enrolled::Going {
                prompt: Prompt::TurnSlightlyLeft,
                taken: 4
            }
        );
    }

    /// Someone stepping in halfway must not end up in the template.
    #[test]
    fn enrols_one_person_only() {
        let mut enrolment = Enrolment::default();
        enrolment.frame(straight());
        assert_eq!(
            enrolment.frame(face(stranger(), 0.0, 0.25)),
            Enrolled::Going {
                prompt: Prompt::LookAtCamera,
                taken: 1
            }
        );
    }

    // Unlock

    fn unlock(challenges: [Challenge; 2]) -> Unlock {
        Unlock::new(student(), challenges, 1_000)
    }

    #[test]
    fn passes_when_both_challenges_are_met_by_the_student() {
        let mut attempt = unlock([Challenge::TurnLeft, Challenge::ComeCloser]);
        let going = |prompt, done| Unlocking::Going { prompt, done };
        assert_eq!(attempt.frame(straight(), 1_100), going(Prompt::TurnLeft, 0));
        assert_eq!(
            attempt.frame(face(student(), 0.15, 0.25), 1_200),
            going(Prompt::TurnLeft, 0)
        );
        assert_eq!(
            attempt.frame(face(student(), 0.35, 0.25), 1_300),
            going(Prompt::LookAtCamera, 1)
        );
        assert_eq!(
            attempt.frame(straight(), 1_400),
            going(Prompt::ComeCloser, 1)
        );
        assert_eq!(
            attempt.frame(face(student(), 0.0, 0.29), 1_500),
            going(Prompt::ComeCloser, 1)
        );
        assert_eq!(
            attempt.frame(face(student(), 0.0, 0.32), 1_600),
            Unlocking::Passed
        );
        assert!(attempt.saw_a_face());
    }

    #[test]
    fn needs_a_straight_look_before_each_move() {
        let mut attempt = unlock([Challenge::TurnRight, Challenge::TurnLeft]);
        // Already turned: does not count until seen straight on first.
        assert_eq!(
            attempt.frame(face(student(), -0.4, 0.25), 1_100),
            Unlocking::Going {
                prompt: Prompt::LookAtCamera,
                done: 0
            }
        );
    }

    /// A photo held up for one frame, a stranger, a second face, no face: the
    /// challenge starts over.
    #[test]
    fn starts_the_challenge_over_on_any_frame_that_does_not_match() {
        for interruption in [
            face(stranger(), 0.35, 0.25),
            Seen::SeveralFaces,
            Seen::NoFace,
            face(student(), 0.35, 0.05),
        ] {
            let mut attempt = unlock([Challenge::TurnLeft, Challenge::TurnRight]);
            attempt.frame(straight(), 1_100);
            attempt.frame(interruption.clone(), 1_200);
            assert_eq!(
                attempt.frame(face(student(), 0.35, 0.25), 1_300),
                Unlocking::Going {
                    prompt: Prompt::LookAtCamera,
                    done: 0
                },
                "{interruption:?}"
            );
        }
    }

    #[test]
    fn a_stranger_never_gets_past_the_first_challenge() {
        let mut attempt = unlock([Challenge::TurnLeft, Challenge::TurnRight]);
        for (i, yaw) in [0.0, 0.35, 0.0, -0.35].into_iter().enumerate() {
            let result = attempt.frame(face(stranger(), yaw, 0.25), 1_100 + i as u64 * 100);
            assert!(matches!(result, Unlocking::Going { done: 0, .. }));
        }
        assert_eq!(attempt.frame(straight(), 11_000), Unlocking::TimedOut);
    }

    #[test]
    fn times_out_after_ten_seconds() {
        let mut attempt = unlock([Challenge::TurnLeft, Challenge::TurnRight]);
        assert!(matches!(
            attempt.frame(straight(), 10_999),
            Unlocking::Going { .. }
        ));
        assert_eq!(attempt.frame(straight(), 11_000), Unlocking::TimedOut);
        assert!(!unlock([Challenge::TurnLeft, Challenge::TurnRight]).saw_a_face());
    }

    #[test]
    fn picks_two_different_challenges_in_every_order() {
        let orders: std::collections::HashSet<_> =
            (0..60u64).map(|r| format!("{:?}", challenges(r))).collect();
        assert_eq!(orders.len(), 6);
        for random in 0..6u64 {
            let [first, second] = challenges(random);
            assert_ne!(first, second);
        }
    }

    // Lockout

    #[test]
    fn locks_after_three_failures_for_five_minutes() {
        let mut lockout = Lockout::default();
        lockout.failed(0);
        lockout.failed(10);
        assert!(!lockout.locked(20));
        lockout.failed(30);
        assert!(lockout.locked(30));
        assert!(lockout.locked(30 + PAUSE_MS - 1));
        assert!(!lockout.locked(30 + PAUSE_MS));
        // Afterwards, three tries again.
        lockout.failed(PAUSE_MS + 100);
        assert!(!lockout.locked(PAUSE_MS + 100));
    }

    #[test]
    fn a_sign_in_by_hand_lifts_the_lock() {
        let mut lockout = Lockout::default();
        for at in 0..3 {
            lockout.failed(at);
        }
        assert!(lockout.locked(5));
        lockout.signed_in();
        assert!(!lockout.locked(6));
    }
}
