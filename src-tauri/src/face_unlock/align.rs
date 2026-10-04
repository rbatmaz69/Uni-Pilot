//! A face turned and scaled onto the 112×112 template SFace was trained on.
//!
//! The five landmarks are mapped onto the template's five points by the
//! similarity transform (scale, rotation, shift — no shear, no mirroring) that
//! fits them best in the least-squares sense, as OpenCV's `alignCrop` does;
//! then the face is resampled through it.

use super::detect::Point;
use super::frame::Frame;

pub const SIZE: usize = 112;

/// Where SFace expects the eyes, the nose tip and the mouth corners, in
/// YuNet's order.
pub const TEMPLATE: [Point; 5] = [
    Point {
        x: 38.2946,
        y: 51.6963,
    },
    Point {
        x: 73.5318,
        y: 51.5014,
    },
    Point {
        x: 56.0252,
        y: 71.7366,
    },
    Point {
        x: 41.5493,
        y: 92.3655,
    },
    Point {
        x: 70.7299,
        y: 92.2041,
    },
];

/// `x' = a·x − b·y + tx`, `y' = b·x + a·y + ty`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Similarity {
    pub a: f32,
    pub b: f32,
    pub tx: f32,
    pub ty: f32,
}

impl Similarity {
    pub fn apply(&self, p: Point) -> Point {
        Point {
            x: self.a * p.x - self.b * p.y + self.tx,
            y: self.b * p.x + self.a * p.y + self.ty,
        }
    }

    pub fn inverse(&self) -> Option<Self> {
        let norm = self.a * self.a + self.b * self.b;
        if norm <= f32::EPSILON {
            return None;
        }
        let (a, b) = (self.a / norm, -self.b / norm);
        Some(Self {
            a,
            b,
            tx: -(a * self.tx - b * self.ty),
            ty: -(b * self.tx + a * self.ty),
        })
    }
}

/// The similarity that maps `from` onto `to` best. `None` when the points
/// are all in one place.
pub fn fit(from: &[Point; 5], to: &[Point; 5]) -> Option<Similarity> {
    let mean = |points: &[Point; 5]| Point {
        x: points.iter().map(|p| p.x).sum::<f32>() / 5.0,
        y: points.iter().map(|p| p.y).sum::<f32>() / 5.0,
    };
    let (from_mean, to_mean) = (mean(from), mean(to));
    let (mut dot, mut cross, mut spread) = (0.0, 0.0, 0.0);
    for (p, q) in from.iter().zip(to) {
        let (px, py) = (p.x - from_mean.x, p.y - from_mean.y);
        let (qx, qy) = (q.x - to_mean.x, q.y - to_mean.y);
        dot += px * qx + py * qy;
        cross += px * qy - py * qx;
        spread += px * px + py * py;
    }
    if spread <= f32::EPSILON {
        return None;
    }
    let (a, b) = (dot / spread, cross / spread);
    Some(Similarity {
        a,
        b,
        tx: to_mean.x - (a * from_mean.x - b * from_mean.y),
        ty: to_mean.y - (b * from_mean.x + a * from_mean.y),
    })
}

/// The face, 112×112, as RGB 0–255 channels first — SFace's input.
pub fn crop(frame: &Frame, landmarks: &[Point; 5]) -> Option<Vec<f32>> {
    let back = fit(landmarks, &TEMPLATE)?.inverse()?;
    let plane = SIZE * SIZE;
    let mut tensor = vec![0.0; 3 * plane];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let source = back.apply(Point {
                x: x as f32,
                y: y as f32,
            });
            let colour = frame.sample(source.x, source.y);
            for (channel, value) in colour.into_iter().enumerate() {
                tensor[channel * plane + y * SIZE + x] = value;
            }
        }
    }
    Some(tensor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::face_unlock::frame::tests::gradient;

    fn close(a: Point, b: Point, within: f32) -> bool {
        (a.x - b.x).abs() < within && (a.y - b.y).abs() < within
    }

    #[test]
    fn fits_the_template_onto_itself() {
        let identity = fit(&TEMPLATE, &TEMPLATE).unwrap();
        assert!((identity.a - 1.0).abs() < 1e-5 && identity.b.abs() < 1e-5);
        assert!(identity.tx.abs() < 1e-3 && identity.ty.abs() < 1e-3);
    }

    /// A face twice as large, turned by 20° and moved, lands back on the
    /// template within a hundredth of a pixel.
    #[test]
    fn maps_a_scaled_turned_shifted_face_back() {
        let angle = 20f32.to_radians();
        let warp = Similarity {
            a: 2.0 * angle.cos(),
            b: 2.0 * angle.sin(),
            tx: 210.0,
            ty: 130.0,
        };
        let face = TEMPLATE.map(|p| warp.apply(p));
        let back = fit(&face, &TEMPLATE).unwrap();
        for (seen, wanted) in face.iter().zip(TEMPLATE) {
            assert!(close(back.apply(*seen), wanted, 0.01), "{seen:?}");
        }
        let undone = warp.inverse().unwrap();
        for p in face {
            assert!(close(undone.apply(p), back.apply(p), 0.01));
        }
    }

    #[test]
    fn gives_up_on_points_in_one_place() {
        let same = [Point { x: 5.0, y: 5.0 }; 5];
        assert_eq!(fit(&same, &TEMPLATE), None);
    }

    /// With the landmarks where the template has them, the crop is the
    /// picture itself, as RGB channels first.
    #[test]
    fn crops_without_moving_an_aligned_face() {
        let frame = gradient(200, 200);
        let crop = crop(&frame, &TEMPLATE).unwrap();
        let plane = SIZE * SIZE;
        let at = 30 * SIZE + 70;
        assert!((crop[at] - 70.0).abs() < 1e-2, "red is x");
        assert!((crop[plane + at] - 30.0).abs() < 1e-2, "green is y");
        assert!((crop[2 * plane + at] - 100.0).abs() < 1e-2);
    }
}
