//! One camera frame, decoded: RGB bytes, kept only while it is looked at.

/// A picture as RGB, three bytes a pixel, row by row.
pub struct Frame {
    pub rgb: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

/// Frames come from the page at 640×480; anything far larger is not a camera frame.
const MAX_SIDE: u32 = 4096;

impl Frame {
    pub fn from_jpeg(jpeg: &[u8]) -> Result<Self, String> {
        let image = image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg)
            .map_err(|_| "The camera frame could not be read.".to_string())?;
        if image.width() > MAX_SIDE || image.height() > MAX_SIDE {
            return Err("The camera frame is larger than any camera's.".into());
        }
        let rgb = image.to_rgb8();
        Ok(Self {
            width: rgb.width() as usize,
            height: rgb.height() as usize,
            rgb: rgb.into_raw(),
        })
    }

    /// The colour at a point between pixels, by bilinear interpolation, with
    /// pixel centres on whole numbers as in OpenCV. Black outside the picture.
    pub fn sample(&self, x: f32, y: f32) -> [f32; 3] {
        let (x0, y0) = (x.floor(), y.floor());
        let (fx, fy) = (x - x0, y - y0);
        let (x0, y0) = (x0 as isize, y0 as isize);
        let mut colour = [0.0; 3];
        for (dx, dy, weight) in [
            (0, 0, (1.0 - fx) * (1.0 - fy)),
            (1, 0, fx * (1.0 - fy)),
            (0, 1, (1.0 - fx) * fy),
            (1, 1, fx * fy),
        ] {
            if weight == 0.0 {
                continue;
            }
            let (px, py) = (x0 + dx, y0 + dy);
            if px < 0 || py < 0 || px as usize >= self.width || py as usize >= self.height {
                continue;
            }
            let at = (py as usize * self.width + px as usize) * 3;
            for (channel, value) in colour.iter_mut().enumerate() {
                *value += weight * f32::from(self.rgb[at + channel]);
            }
        }
        colour
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::Frame;

    /// A synthetic picture: red rises left to right, green top to bottom.
    pub fn gradient(width: usize, height: usize) -> Frame {
        let mut rgb = Vec::with_capacity(width * height * 3);
        for y in 0..height {
            for x in 0..width {
                rgb.extend([(x % 256) as u8, (y % 256) as u8, 100]);
            }
        }
        Frame { rgb, width, height }
    }

    #[test]
    fn samples_between_pixels() {
        let frame = gradient(8, 8);
        assert_eq!(frame.sample(3.0, 5.0), [3.0, 5.0, 100.0]);
        assert_eq!(frame.sample(3.5, 5.25), [3.5, 5.25, 100.0]);
        assert_eq!(frame.sample(-5.0, 2.0), [0.0, 0.0, 0.0], "outside is black");
    }

    #[test]
    fn reads_a_jpeg_and_refuses_anything_else() {
        let mut jpeg = Vec::new();
        image::RgbImage::from_pixel(16, 12, image::Rgb([200, 40, 10]))
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg),
                image::ImageFormat::Jpeg,
            )
            .unwrap();
        let frame = Frame::from_jpeg(&jpeg).unwrap();
        assert_eq!(
            (frame.width, frame.height, frame.rgb.len()),
            (16, 12, 16 * 12 * 3)
        );
        assert!((i32::from(frame.rgb[0]) - 200).abs() < 8);

        assert!(Frame::from_jpeg(b"not a picture").is_err());
    }
}
