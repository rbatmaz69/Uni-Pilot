//! Whether a face moves as asked, read from YuNet's landmarks.
//!
//! YuNet gives eyes, nose tip and mouth corners — no eyelids, so no blink.
//! What it does give is enough for a head turn and for coming closer:
//!
//! - **Yaw:** how far the nose tip sits from the middle between the eyes,
//!   along the line through the eyes, in eye distances. About 0 looking
//!   straight on; **positive when the student turns to their left** — to the
//!   left in the mirrored preview, which is what the prompts mean. The sign is
//!   measured, not derived: in the first real run (04.10.2026) the opposite
//!   sign read −0.06 for a turn to the left and +0.31 for one to the right. In
//!   the landmarks as YuNet reports them, a turn to the left moves the nose
//!   towards the first eye.
//! - **Size:** the face box's width as a share of the frame's width.
//!
//! There is no anti-spoofing model yet (`models/README.md`): these challenges
//! are all that stands between a photo and the sign-in.
//!
//! **What a yaw means.** A head turned by θ puts the nose tip `d·sin θ` to the
//! side while the eyes come `D·cos θ` apart, so yaw = (d / D)·tan θ — with D
//! the eye distance (about 63 mm) and d how far the nose tip stands in front
//! of the eyes (22–35 mm, by face). That is 0.35–0.55 × tan θ: a turn of 30°
//! reads 0.20–0.32, a look 10° off 0.06–0.10. The first guess, 0.30 for a
//! turn, asked for 29°–40° — further than people turn when asked, and far
//! enough for SFace to stop recognising the face, which starts the challenge
//! over. The thresholds below come from this geometry, not from measured
//! faces; the debug log of `face_unlock_frame` prints the numbers to check them.

use super::detect::Detection;

/// Facing the camera: within about 10°–16°.
pub const STRAIGHT: f32 = 0.10;
/// A clear turn, for unlocking: from about 16°–25° on. Well clear of
/// `STRAIGHT`, so a straight look with a jittery landmark never counts.
pub const TURNED: f32 = 0.16;
/// A slight turn, for the enrolment's side views: between these, about
/// 10°–16° up to 30°–36°.
pub const SLIGHT: (f32, f32) = (0.10, 0.30);
/// Coming closer means a face this much wider than when the challenge began.
pub const CLOSER: f32 = 1.25;
/// Smaller than this, and SFace has too few pixels to go on.
pub const LARGE_ENOUGH: f32 = 0.12;

pub fn yaw(face: &Detection) -> f32 {
    let [right_eye, left_eye, nose, ..] = face.landmarks;
    let (ex, ey) = (left_eye.x - right_eye.x, left_eye.y - right_eye.y);
    let distance = (ex * ex + ey * ey).sqrt();
    if distance <= f32::EPSILON {
        return 0.0;
    }
    let (mx, my) = (
        (left_eye.x + right_eye.x) / 2.0,
        (left_eye.y + right_eye.y) / 2.0,
    );
    // Towards the first eye is to the student's left: see above.
    ((mx - nose.x) * ex + (my - nose.y) * ey) / (distance * distance)
}

pub fn size(face: &Detection, frame_width: usize) -> f32 {
    face.width / frame_width.max(1) as f32
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::face_unlock::detect::Point;

    /// A face 160 px wide at (240, 160), turned `turn` eye distances to the
    /// student's left — the nose that far towards the first eye, as measured —
    /// and the whole face rolled by `roll` degrees.
    pub fn face(turn: f32, roll: f32) -> Detection {
        let (sin, cos) = roll.to_radians().sin_cos();
        let at = |x: f32, y: f32| Point {
            x: 320.0 + x * cos - y * sin,
            y: 240.0 + x * sin + y * cos,
        };
        Detection {
            x: 240.0,
            y: 160.0,
            width: 160.0,
            height: 180.0,
            landmarks: [
                at(-30.0, -20.0),
                at(30.0, -20.0),
                at(-60.0 * turn, 10.0),
                at(-25.0, 40.0),
                at(25.0, 40.0),
            ],
            score: 0.95,
        }
    }

    #[test]
    fn reads_a_head_turn_from_the_nose() {
        assert!(yaw(&face(0.0, 0.0)).abs() < 1e-5);
        assert!(
            (yaw(&face(0.35, 0.0)) - 0.35).abs() < 1e-4,
            "to the student's left"
        );
        assert!(
            (yaw(&face(-0.35, 0.0)) + 0.35).abs() < 1e-4,
            "to the student's right"
        );
    }

    /// Tilting the head sideways is not turning it.
    #[test]
    fn is_not_fooled_by_a_tilted_head() {
        assert!(yaw(&face(0.0, 25.0)).abs() < 1e-4);
        assert!((yaw(&face(0.35, -25.0)) - 0.35).abs() < 1e-4);
    }

    /// A head as Rust sees it: eyes 63 mm apart, the nose tip `depth` mm in
    /// front of them, turned by `degrees` to the student's left — which
    /// moves the nose towards the first eye in YuNet's landmarks.
    fn head(degrees: f32, depth: f32) -> Detection {
        let (sin, cos) = degrees.to_radians().sin_cos();
        // Millimetres on the face → pixels, turned about the vertical axis.
        let at = |x: f32, y: f32, z: f32| Point {
            x: 320.0 + 2.5 * (x * cos - z * sin),
            y: 240.0 + 2.5 * y,
        };
        Detection {
            x: 240.0,
            y: 160.0,
            width: 160.0,
            height: 180.0,
            landmarks: [
                at(-31.5, 0.0, 0.0),
                at(31.5, 0.0, 0.0),
                at(0.0, 28.0, depth),
                at(-25.0, 55.0, 8.0),
                at(25.0, 55.0, 8.0),
            ],
            score: 0.95,
        }
    }

    /// For every nose depth people have: a clear turn of about 30° counts,
    /// a look a few degrees off is straight and never a turn.
    #[test]
    fn counts_a_clear_turn_and_not_a_straight_look() {
        for depth in [22.0, 27.0, 35.0] {
            for degrees in [-6.0, 0.0, 6.0] {
                let seen = yaw(&head(degrees, depth));
                assert!(seen.abs() <= STRAIGHT, "{degrees}° at {depth} mm: {seen}");
            }
            for degrees in [28.0, 35.0, 45.0] {
                let left = yaw(&head(degrees, depth));
                let right = yaw(&head(-degrees, depth));
                assert!(left >= TURNED, "{degrees}° left at {depth} mm: {left}");
                assert!(right <= -TURNED, "{degrees}° right at {depth} mm: {right}");
            }
            let slight = yaw(&head(20.0, depth));
            assert!(
                (SLIGHT.0..=SLIGHT.1).contains(&slight),
                "20° at {depth} mm: {slight}"
            );
        }
    }

    #[test]
    fn measures_the_face_against_the_frame() {
        assert!((size(&face(0.0, 0.0), 640) - 0.25).abs() < 1e-6);
    }
}
