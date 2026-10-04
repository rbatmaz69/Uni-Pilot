//! SFace's 128 numbers for a face, and how alike two faces are.
//!
//! An embedding is L2-normalised, so the cosine of two is their dot product:
//! 1 for the same picture, around 0 for strangers. OpenCV's same-person
//! threshold for SFace is 0.363; unlocking starts stricter, at 0.50, until the
//! calibration in Phase 4 of `docs/face-unlock-plan.md` has numbers.

pub const LENGTH: usize = 128;
pub const SAME_PERSON: f32 = 0.50;

pub type Embedding = [f32; LENGTH];

/// SFace's raw output, scaled to length 1. `None` for a wrong length or zeros.
pub fn normalise(raw: &[f32]) -> Option<Embedding> {
    if raw.len() != LENGTH {
        return None;
    }
    let length = raw.iter().map(|v| v * v).sum::<f32>().sqrt();
    if !length.is_finite() || length <= f32::EPSILON {
        return None;
    }
    Some(std::array::from_fn(|i| raw[i] / length))
}

pub fn cosine(a: &Embedding, b: &Embedding) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// The template: the mean of several embeddings, normalised again.
pub fn mean(embeddings: &[Embedding]) -> Option<Embedding> {
    if embeddings.is_empty() {
        return None;
    }
    let sum: Vec<f32> = (0..LENGTH)
        .map(|i| embeddings.iter().map(|e| e[i]).sum())
        .collect();
    normalise(&sum)
}

/// 512 bytes, little-endian, for the credential store.
pub fn to_bytes(embedding: &Embedding) -> Vec<u8> {
    embedding.iter().flat_map(|v| v.to_le_bytes()).collect()
}

pub fn from_bytes(bytes: &[u8]) -> Option<Embedding> {
    if bytes.len() != LENGTH * 4 {
        return None;
    }
    let values: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    // Stored normalised; normalising again refuses zeros and NaN.
    normalise(&values)
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    /// A synthetic embedding pointing mostly along `axis`, a little along `lean`.
    pub fn towards(axis: usize, lean: usize, amount: f32) -> Embedding {
        let mut raw = [0.0; LENGTH];
        raw[axis] = 1.0;
        raw[lean] += amount;
        normalise(&raw).unwrap()
    }

    #[test]
    fn scales_to_length_one() {
        let mut raw = [0.0; LENGTH];
        raw[3] = 3.0;
        raw[4] = 4.0;
        let unit = normalise(&raw).unwrap();
        assert!((unit[3] - 0.6).abs() < 1e-6 && (unit[4] - 0.8).abs() < 1e-6);
        assert_eq!(normalise(&[0.0; LENGTH]), None);
        assert_eq!(normalise(&[1.0; 12]), None);
    }

    #[test]
    fn says_how_alike_two_faces_are() {
        let a = towards(0, 1, 0.1);
        assert!((cosine(&a, &a) - 1.0).abs() < 1e-5);
        assert!(cosine(&a, &towards(0, 2, 0.3)) > SAME_PERSON);
        assert!(cosine(&a, &towards(5, 6, 0.1)) < 0.1);
    }

    #[test]
    fn averages_into_a_template() {
        let template = mean(&[towards(0, 1, 0.2), towards(0, 1, -0.2)]).unwrap();
        assert!((template[0] - 1.0).abs() < 1e-5 && template[1].abs() < 1e-5);
        assert_eq!(mean(&[]), None);
    }

    #[test]
    fn stores_and_reads_back_512_bytes() {
        let template = towards(7, 9, 0.5);
        let bytes = to_bytes(&template);
        assert_eq!(bytes.len(), 512);
        let back = from_bytes(&bytes).unwrap();
        assert!(cosine(&back, &template) > 0.999_999);
        assert_eq!(from_bytes(&bytes[..500]), None);
        assert_eq!(from_bytes(&[0; 512]), None);
    }
}
