//! YuNet: where the faces are, each with five landmarks — decoded as OpenCV's
//! `FaceDetectorYN` does for the 2023mar model.
//!
//! The model looks at a grid per stride (8, 16, 32). Every cell says how sure
//! it is that a face is centred there (`cls`, `obj`), where the box is
//! (`bbox`: offset and log size) and where the landmarks are (`kps`). A face
//! counts at √(cls·obj) ≥ 0.85, as in the spike; overlapping boxes are thinned
//! by non-maximum suppression.

use super::frame::Frame;

/// The detector's input size. Both sides must be multiples of 32.
pub const WIDTH: usize = 320;
pub const HEIGHT: usize = 256;
pub const STRIDES: [usize; 3] = [8, 16, 32];
const SCORE: f32 = 0.85;
const OVERLAP: f32 = 0.3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    /// Right eye, left eye, nose tip, right and left corner of the mouth —
    /// the person's right, which is the left of the picture.
    pub landmarks: [Point; 5],
    pub score: f32,
}

/// The model's twelve outputs, by name: `cls_8` … `kps_32`, one per stride.
pub struct Outputs<'a> {
    pub cls: [&'a [f32]; 3],
    pub obj: [&'a [f32]; 3],
    pub bbox: [&'a [f32]; 3],
    pub kps: [&'a [f32]; 3],
}

/// The frame scaled to fit 320×256 and padded with black below or to the
/// right, as YuNet wants it: BGR, 0–255, channels first. Returns the scale, to
/// map faces back onto the frame.
pub fn input(frame: &Frame) -> (Vec<f32>, f32) {
    let scale = (WIDTH as f32 / frame.width as f32).min(HEIGHT as f32 / frame.height as f32);
    let used_width = ((frame.width as f32 * scale).round() as usize).min(WIDTH);
    let used_height = ((frame.height as f32 * scale).round() as usize).min(HEIGHT);
    let plane = WIDTH * HEIGHT;
    let mut tensor = vec![0.0; 3 * plane];
    for y in 0..used_height {
        for x in 0..used_width {
            let [red, green, blue] = frame.sample(
                (x as f32 + 0.5) / scale - 0.5,
                (y as f32 + 0.5) / scale - 0.5,
            );
            let at = y * WIDTH + x;
            tensor[at] = blue;
            tensor[plane + at] = green;
            tensor[2 * plane + at] = red;
        }
    }
    (tensor, scale)
}

/// The faces in the outputs, best first, on the frame's scale.
pub fn decode(outputs: &Outputs, scale: f32) -> Result<Vec<Detection>, String> {
    let mut found = Vec::new();
    for (level, stride) in STRIDES.iter().enumerate() {
        let (columns, rows) = (WIDTH / stride, HEIGHT / stride);
        let cells = columns * rows;
        let (cls, obj) = (outputs.cls[level], outputs.obj[level]);
        let (bbox, kps) = (outputs.bbox[level], outputs.kps[level]);
        if cls.len() != cells
            || obj.len() != cells
            || bbox.len() != 4 * cells
            || kps.len() != 10 * cells
        {
            return Err(format!(
                "YuNet answered an unexpected shape at stride {stride}."
            ));
        }
        let stride = *stride as f32;
        for row in 0..rows {
            for column in 0..columns {
                let cell = row * columns + column;
                let score = (cls[cell].clamp(0.0, 1.0) * obj[cell].clamp(0.0, 1.0)).sqrt();
                if score < SCORE {
                    continue;
                }
                let (c, r) = (column as f32, row as f32);
                let centre_x = (c + bbox[cell * 4]) * stride;
                let centre_y = (r + bbox[cell * 4 + 1]) * stride;
                let width = bbox[cell * 4 + 2].exp() * stride;
                let height = bbox[cell * 4 + 3].exp() * stride;
                let landmarks = std::array::from_fn(|n| Point {
                    x: (kps[cell * 10 + 2 * n] + c) * stride / scale,
                    y: (kps[cell * 10 + 2 * n + 1] + r) * stride / scale,
                });
                found.push(Detection {
                    x: (centre_x - width / 2.0) / scale,
                    y: (centre_y - height / 2.0) / scale,
                    width: width / scale,
                    height: height / scale,
                    landmarks,
                    score,
                });
            }
        }
    }
    Ok(suppress(found))
}

fn overlap(a: &Detection, b: &Detection) -> f32 {
    let left = a.x.max(b.x);
    let top = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);
    let shared = (right - left).max(0.0) * (bottom - top).max(0.0);
    let union = a.width * a.height + b.width * b.height - shared;
    if union <= 0.0 {
        0.0
    } else {
        shared / union
    }
}

/// Non-maximum suppression: of boxes overlapping by more than 0.3, the best.
fn suppress(mut found: Vec<Detection>) -> Vec<Detection> {
    found.sort_by(|a, b| b.score.total_cmp(&a.score));
    let mut kept: Vec<Detection> = Vec::new();
    for candidate in found {
        if kept.iter().all(|face| overlap(face, &candidate) <= OVERLAP) {
            kept.push(candidate);
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::face_unlock::frame::tests::gradient;

    /// YuNet's outputs with nothing in them: no cell sure of a face.
    struct Blank {
        cls: Vec<Vec<f32>>,
        obj: Vec<Vec<f32>>,
        bbox: Vec<Vec<f32>>,
        kps: Vec<Vec<f32>>,
    }

    impl Blank {
        fn new() -> Self {
            let cells = |stride: &usize| (WIDTH / stride) * (HEIGHT / stride);
            Self {
                cls: STRIDES.iter().map(|s| vec![0.0; cells(s)]).collect(),
                obj: STRIDES.iter().map(|s| vec![0.0; cells(s)]).collect(),
                bbox: STRIDES.iter().map(|s| vec![0.0; 4 * cells(s)]).collect(),
                kps: STRIDES.iter().map(|s| vec![0.0; 10 * cells(s)]).collect(),
            }
        }

        /// A face in one cell of one stride: centre offset (0.5, 0.5), box
        /// `size` cells wide, landmarks at fixed offsets.
        fn face(mut self, level: usize, row: usize, column: usize, score: f32, size: f32) -> Self {
            let columns = WIDTH / STRIDES[level];
            let cell = row * columns + column;
            self.cls[level][cell] = score * score;
            self.obj[level][cell] = 1.0;
            self.bbox[level][cell * 4..cell * 4 + 4].copy_from_slice(&[
                0.5,
                0.5,
                size.ln(),
                size.ln(),
            ]);
            let marks = [-0.3, -0.2, 1.3, -0.2, 0.5, 0.3, -0.1, 0.9, 1.1, 0.9];
            self.kps[level][cell * 10..cell * 10 + 10].copy_from_slice(&marks);
            self
        }

        fn outputs(&self) -> Outputs<'_> {
            fn three(v: &[Vec<f32>]) -> [&[f32]; 3] {
                [&v[0], &v[1], &v[2]]
            }
            Outputs {
                cls: three(&self.cls),
                obj: three(&self.obj),
                bbox: three(&self.bbox),
                kps: three(&self.kps),
            }
        }
    }

    #[test]
    fn finds_nothing_in_nothing() {
        assert!(decode(&Blank::new().outputs(), 1.0).unwrap().is_empty());
    }

    #[test]
    fn decodes_box_and_landmarks_onto_the_frame() {
        // Stride 16, row 5, column 9: centre at ((9.5)·16, (5.5)·16) = (152, 88).
        let blank = Blank::new().face(1, 5, 9, 0.95, 4.0);
        let faces = decode(&blank.outputs(), 0.5).unwrap();
        assert_eq!(faces.len(), 1);
        let face = &faces[0];
        assert!((face.score - 0.95).abs() < 1e-5);
        // 64 wide in detector pixels, at scale 0.5 → 128 on the frame.
        assert!((face.width - 128.0).abs() < 1e-3);
        assert!((face.x - (152.0 - 32.0) * 2.0).abs() < 1e-3);
        assert!((face.y - (88.0 - 32.0) * 2.0).abs() < 1e-3);
        // Right eye: (-0.3 + 9)·16 / 0.5.
        assert!((face.landmarks[0].x - 8.7 * 32.0).abs() < 1e-3);
        assert!((face.landmarks[2].y - 5.3 * 32.0).abs() < 1e-3);
    }

    #[test]
    fn ignores_faces_below_the_threshold() {
        let blank = Blank::new().face(0, 10, 10, 0.80, 6.0);
        assert!(decode(&blank.outputs(), 1.0).unwrap().is_empty());
    }

    /// The same face seen by two neighbouring cells is one face; a face
    /// elsewhere is a second one.
    #[test]
    fn keeps_one_box_per_face() {
        let blank = Blank::new()
            .face(1, 5, 9, 0.95, 4.0)
            .face(1, 5, 10, 0.90, 4.0)
            .face(2, 2, 2, 0.92, 2.0);
        let faces = decode(&blank.outputs(), 1.0).unwrap();
        assert_eq!(faces.len(), 2);
        assert!((faces[0].score - 0.95).abs() < 1e-5, "the best one stays");
    }

    #[test]
    fn refuses_outputs_of_the_wrong_shape() {
        let mut blank = Blank::new();
        blank.kps[2].pop();
        assert!(decode(&blank.outputs(), 1.0).is_err());
    }

    #[test]
    fn letterboxes_the_frame_in_bgr() {
        let frame = gradient(640, 480);
        let (tensor, scale) = input(&frame);
        assert_eq!(scale, 0.5);
        assert_eq!(tensor.len(), 3 * WIDTH * HEIGHT);
        let plane = WIDTH * HEIGHT;
        // Pixel (10, 20) of the input is the average of frame pixels 20–21, 40–41.
        let at = 20 * WIDTH + 10;
        assert_eq!(tensor[at], 100.0, "blue first");
        assert!((tensor[plane + at] - 40.5).abs() < 1e-3, "green");
        assert!((tensor[2 * plane + at] - 20.5).abs() < 1e-3, "red last");
        // 480 · 0.5 = 240 rows of picture, then black.
        assert_eq!(tensor[2 * plane + 250 * WIDTH + 10], 0.0);
    }
}
