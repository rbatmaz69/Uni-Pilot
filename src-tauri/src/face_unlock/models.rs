//! YuNet and SFace, loaded once from `models/` among the app's resources, and
//! one frame run through both.
//!
//! Both are loaded with a fixed input size, as spike 0.5 found they must be:
//! YuNet has 640×640 written into its intermediate shapes, so tract is told to
//! ignore the stored shapes and given 1×3×256×320; SFace takes 1×3×112×112.
//! The fp32 SFace, because tract cannot run the int8 one.

use std::path::Path;
use std::sync::Arc;

use tract_onnx::prelude::*;

use super::align;
use super::attempt::{Face, Seen};
use super::detect::{self, Outputs};
use super::embed;
use super::frame::Frame;
use super::liveness;

pub const DETECTOR: &str = "face_detection_yunet_2023mar.onnx";
pub const RECOGNISER: &str = "face_recognition_sface_2021dec.onnx";

/// YuNet's outputs in the order `Outputs` wants them.
const DETECTOR_OUTPUTS: [&str; 12] = [
    "cls_8", "cls_16", "cls_32", "obj_8", "obj_16", "obj_32", "bbox_8", "bbox_16", "bbox_32",
    "kps_8", "kps_16", "kps_32",
];

pub struct Models {
    detector: Arc<TypedRunnableModel>,
    /// Where each of `DETECTOR_OUTPUTS` is among the detector's outputs.
    detector_outputs: [usize; 12],
    recogniser: Arc<TypedRunnableModel>,
}

fn load(
    path: &Path,
    shape: [usize; 4],
    ignore_stored_shapes: bool,
) -> TractResult<Arc<TypedRunnableModel>> {
    tract_onnx::onnx()
        .with_ignore_value_info(ignore_stored_shapes)
        .with_ignore_output_shapes(ignore_stored_shapes)
        .model_for_path(path)?
        .with_input_fact(0, f32::fact(shape).into())?
        .into_optimized()?
        .into_runnable()
}

/// A model's output as plain numbers, whatever its layout in memory.
fn floats(output: &Tensor) -> Result<Vec<f32>, String> {
    Ok(output
        .to_plain_array_view::<f32>()
        .map_err(|error| error.to_string())?
        .iter()
        .copied()
        .collect())
}

impl Models {
    /// Both models from `dir`. The message says which file is missing or broken.
    pub fn load(dir: &Path) -> Result<Self, String> {
        let file = |name: &str| {
            let path = dir.join(name);
            if path.is_file() {
                Ok(path)
            } else {
                Err(format!("{name} is missing from {}.", dir.display()))
            }
        };
        let detector = load(
            &file(DETECTOR)?,
            [1, 3, detect::HEIGHT, detect::WIDTH],
            true,
        )
        .map_err(|error| format!("{DETECTOR} could not be loaded: {error}"))?;
        let recogniser = load(&file(RECOGNISER)?, [1, 3, align::SIZE, align::SIZE], false)
            .map_err(|error| format!("{RECOGNISER} could not be loaded: {error}"))?;

        let model = detector.model();
        let labels: Vec<Option<&str>> = model
            .output_outlets()
            .map_err(|error| error.to_string())?
            .iter()
            .map(|outlet| model.outlet_label(*outlet))
            .collect();
        let mut detector_outputs = [0; 12];
        for (slot, name) in detector_outputs.iter_mut().zip(DETECTOR_OUTPUTS) {
            *slot = labels
                .iter()
                .position(|label| *label == Some(name))
                .ok_or_else(|| format!("{DETECTOR} has no output {name}."))?;
        }
        Ok(Self {
            detector,
            detector_outputs,
            recogniser,
        })
    }

    /// What a JPEG frame shows. The frame is dropped when this returns.
    pub fn see(&self, jpeg: &[u8]) -> Result<Seen, String> {
        let frame = Frame::from_jpeg(jpeg)?;
        let (input, scale) = detect::input(&frame);
        let input = Tensor::from_shape(&[1, 3, detect::HEIGHT, detect::WIDTH], &input)
            .map_err(|error| error.to_string())?;
        let outputs = self
            .detector
            .run(tvec!(input.into()))
            .map_err(|error| format!("YuNet failed: {error}"))?;
        let values = self
            .detector_outputs
            .iter()
            .map(|&at| floats(&outputs[at]))
            .collect::<Result<Vec<_>, _>>()?;
        let three = |from: usize| {
            [
                values[from].as_slice(),
                values[from + 1].as_slice(),
                values[from + 2].as_slice(),
            ]
        };
        let faces = detect::decode(
            &Outputs {
                cls: three(0),
                obj: three(3),
                bbox: three(6),
                kps: three(9),
            },
            scale,
        )?;

        let face = match faces.as_slice() {
            [] => return Ok(Seen::NoFace),
            [face] => face,
            _ => return Ok(Seen::SeveralFaces),
        };
        let Some(crop) = align::crop(&frame, &face.landmarks) else {
            return Ok(Seen::NoFace);
        };
        let crop = Tensor::from_shape(&[1, 3, align::SIZE, align::SIZE], &crop)
            .map_err(|error| error.to_string())?;
        let output = self
            .recogniser
            .run(tvec!(crop.into()))
            .map_err(|error| format!("SFace failed: {error}"))?;
        let raw = floats(&output[0])?;
        let embedding = embed::normalise(&raw)
            .ok_or_else(|| "SFace answered an unexpected shape.".to_string())?;
        Ok(Seen::Face(Face {
            embedding,
            yaw: liveness::yaw(face),
            size: liveness::size(face, frame.width),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::{Models, DETECTOR, RECOGNISER};
    use crate::face_unlock::attempt::Seen;
    use std::path::Path;

    const MODELS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/models");

    #[test]
    fn says_which_model_is_missing() {
        let error = Models::load(Path::new("/nowhere")).err().unwrap();
        assert!(error.contains(DETECTOR), "{error}");
    }

    /// Runs only where the models were fetched (`scripts/fetch-face-models.js`);
    /// they are not in git. A grey picture has no face in it.
    #[test]
    fn loads_both_models_and_finds_no_face_in_grey() {
        let dir = Path::new(MODELS);
        if !dir.join(DETECTOR).is_file() || !dir.join(RECOGNISER).is_file() {
            println!("Models not fetched; skipped.");
            return;
        }
        let started = std::time::Instant::now();
        let models = Models::load(dir).unwrap();
        println!("Both models loaded in {:?}.", started.elapsed());

        let mut jpeg = Vec::new();
        image::RgbImage::from_pixel(640, 480, image::Rgb([128, 128, 128]))
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg),
                image::ImageFormat::Jpeg,
            )
            .unwrap();
        let started = std::time::Instant::now();
        assert_eq!(models.see(&jpeg).unwrap(), Seen::NoFace);
        println!("One frame in {:?}.", started.elapsed());
    }
}
