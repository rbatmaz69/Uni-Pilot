//! Whether a face moves as asked, read from YuNet's landmarks.
//!
//! YuNet gives eyes, nose tip and mouth corners — no eyelids, so no blink.
//! What it does give is enough for a head turn and for coming closer:
//!
//! - **Yaw:** how far the nose tip sits from the middle between the eyes,
//!   along the line through the eyes, in eye distances. About 0 looking
//!   straight on; positive when the head turns to the person's **left**, which
//!   moves the nose to the right of the picture. Frames are not mirrored; only
//!   the preview on the page is.
//! - **Size:** the face box's width as a share of the frame's width.
//!
//! There is no anti-spoofing model yet (`models/README.md`): these challenges
//! are all that stands between a photo and the sign-in. The thresholds are a
//! first guess until Phase 4's calibration measures them.

use super::detect::Detection;

/// Facing the camera.
pub const STRAIGHT: f32 = 0.12;
/// A clear turn, for unlocking.
pub const TURNED: f32 = 0.30;
/// A slight turn, for the enrolment's side views: between these.
pub const SLIGHT: (f32, f32) = (0.10, 0.40);
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
    ((nose.x - mx) * ex + (nose.y - my) * ey) / (distance * distance)
}

pub fn size(face: &Detection, frame_width: usize) -> f32 {
    face.width / frame_width.max(1) as f32
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::face_unlock::detect::Point;

    /// A face 160 px wide at (240, 160) with the nose `turn` eye distances
    /// from the middle, the whole face rolled by `roll` degrees.
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
                at(60.0 * turn, 10.0),
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
            "to the person's left"
        );
        assert!(
            (yaw(&face(-0.35, 0.0)) + 0.35).abs() < 1e-4,
            "to the person's right"
        );
    }

    /// Tilting the head sideways is not turning it.
    #[test]
    fn is_not_fooled_by_a_tilted_head() {
        assert!(yaw(&face(0.0, 25.0)).abs() < 1e-4);
        assert!((yaw(&face(0.35, -25.0)) - 0.35).abs() < 1e-4);
    }

    #[test]
    fn measures_the_face_against_the_frame() {
        assert!((size(&face(0.0, 0.0), 640) - 0.25).abs() < 1e-6);
    }
}
