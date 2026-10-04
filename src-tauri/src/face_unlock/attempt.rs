//! Enrolment, unlock and the lockout, as state machines fed with what each
//! frame showed. No camera, no models, no clock: time comes in as
//! milliseconds, so every transition is tested as it is.

use serde::Serialize;

use super::embed::{cosine, mean, Embedding, SAME_PERSON};
use super::liveness::{LARGE_ENOUGH, SLIGHT, STRAIGHT};

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
    /// `liveness::yaw`: positive turned to the student's left, which is left
    /// in the mirrored preview.
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
/// How long the enrolled face has to be seen, frame after frame, to pass.
pub const HOLD_MS: u64 = 1_500;

#[derive(Debug, PartialEq)]
pub enum Unlocking {
    Looking,
    Passed,
    TimedOut,
}

/// Passes once the enrolled face has matched for `HOLD_MS` without a break:
/// no challenges, nothing to do but look. A frame without it — no face, two
/// faces, a face too small, a stranger — only starts the count again.
pub struct Unlock {
    template: Embedding,
    /// When the face began to match, frame after frame.
    matching_since: Option<u64>,
    started_ms: u64,
    passed: bool,
    saw_a_stranger: bool,
}

impl Unlock {
    pub fn new(template: Embedding, now_ms: u64) -> Self {
        Self {
            template,
            matching_since: None,
            started_ms: now_ms,
            passed: false,
            saw_a_stranger: false,
        }
    }

    /// Whether a face that is not the student's was seen. An attempt that
    /// ends without passing counts against the student only then: nobody
    /// looking, or looking away, is no attempt to get in.
    pub fn saw_a_stranger(&self) -> bool {
        self.saw_a_stranger
    }

    /// How alike a face is to the template: a number for the development
    /// log, never the template itself.
    #[cfg(debug_assertions)]
    pub fn likeness(&self, embedding: &Embedding) -> f32 {
        cosine(&self.template, embedding)
    }

    pub fn frame(&mut self, seen: Seen, now_ms: u64) -> Unlocking {
        if self.passed {
            return Unlocking::Passed;
        }
        if now_ms.saturating_sub(self.started_ms) >= UNLOCK_MS {
            return Unlocking::TimedOut;
        }
        let matches = match seen {
            Seen::Face(face) if face.size >= LARGE_ENOUGH => {
                let same = cosine(&self.template, &face.embedding) >= SAME_PERSON;
                self.saw_a_stranger |= !same;
                same
            }
            _ => false,
        };
        if !matches {
            self.matching_since = None;
            return Unlocking::Looking;
        }
        let since = *self.matching_since.get_or_insert(now_ms);
        if now_ms.saturating_sub(since) >= HOLD_MS {
            self.passed = true;
            Unlocking::Passed
        } else {
            Unlocking::Looking
        }
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

    fn unlock() -> Unlock {
        Unlock::new(student(), 1_000)
    }

    #[test]
    fn passes_once_the_student_was_seen_for_a_second_and_a_half() {
        let mut attempt = unlock();
        assert_eq!(attempt.frame(straight(), 1_100), Unlocking::Looking);
        // Looking aside is fine: nothing to do but be recognised.
        assert_eq!(
            attempt.frame(face(student(), 0.3, 0.25), 1_900),
            Unlocking::Looking
        );
        assert_eq!(attempt.frame(straight(), 2_599), Unlocking::Looking);
        assert_eq!(attempt.frame(straight(), 2_600), Unlocking::Passed);
        assert!(!attempt.saw_a_stranger());
    }

    /// A stranger, a second face, no face, a face too small: the count
    /// starts again — the prompt does not change.
    #[test]
    fn counts_again_after_any_frame_without_the_student() {
        for interruption in [
            face(stranger(), 0.0, 0.25),
            Seen::SeveralFaces,
            Seen::NoFace,
            face(student(), 0.0, 0.05),
        ] {
            let mut attempt = unlock();
            attempt.frame(straight(), 1_100);
            attempt.frame(interruption.clone(), 2_000);
            assert_eq!(
                attempt.frame(straight(), 2_700),
                Unlocking::Looking,
                "{interruption:?}"
            );
            assert_eq!(
                attempt.frame(straight(), 4_200),
                Unlocking::Passed,
                "{interruption:?}"
            );
        }
    }

    #[test]
    fn a_stranger_never_passes_and_is_noted() {
        let mut attempt = unlock();
        for at in (1_100..10_900).step_by(300) {
            assert_eq!(
                attempt.frame(face(stranger(), 0.0, 0.25), at),
                Unlocking::Looking
            );
        }
        assert_eq!(attempt.frame(straight(), 11_000), Unlocking::TimedOut);
        assert!(attempt.saw_a_stranger());
    }

    #[test]
    fn times_out_after_ten_seconds_without_counting_an_empty_room() {
        let mut attempt = unlock();
        assert_eq!(attempt.frame(Seen::NoFace, 10_999), Unlocking::Looking);
        assert_eq!(attempt.frame(Seen::NoFace, 11_000), Unlocking::TimedOut);
        assert!(!attempt.saw_a_stranger());
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
