//! First pages and pictures for document cards, kept between runs.
//!
//! A card on the document canvas shows a PDF's first page or a picture. The
//! page draws it once (pdf.js for a PDF, scaled down for a picture) and hands
//! the image here. The next time, also after a restart, the card shows it
//! without reading the file. That matters most when macOS has moved the file
//! to iCloud, because reading it would fetch it first.
//!
//! The images live in the app's cache folder (`~/Library/Caches/<id>/previews`
//! on macOS). That folder is neither in iCloud nor in a backup, and the system
//! may empty it. Each image is named by a hash of the file's path,
//! modification time and size, as the document explorer lists them. A changed
//! file gets a new image, and the old one ages out. The folder holds at most `MAX_TOTAL` bytes; the
//! images read least recently go first.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::SystemTime;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

/// One image: a page at about 700 pixels wide is far below this.
const MAX_IMAGE: usize = 4 * 1024 * 1024;
const MAX_TOTAL: u64 = 200 * 1024 * 1024;
/// The folder is tidied on the first write and every this many after it.
const PRUNE_EVERY: usize = 32;
static WRITES: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, PartialEq, Serialize)]
pub struct Cached {
    mime: &'static str,
    base64: String,
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// A file as the document explorer lists it: workspace-relative path,
/// modification time in milliseconds, size in bytes.
#[derive(Debug, Clone, Deserialize)]
pub struct Version {
    path: String,
    modified: u64,
    size: u64,
}

/// The image's file name. The page never names a file here.
fn key(version: &Version) -> String {
    let digest = Sha256::digest(format!(
        "{}\n{}\n{}",
        version.path, version.modified, version.size
    ));
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The image types a webview encodes from a canvas, told by their first bytes.
fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else {
        None
    }
}

fn read(dir: &Path, version: &Version) -> Result<Option<Cached>, String> {
    let path = dir.join(key(version));
    let Ok(bytes) = fs::read(&path) else {
        return Ok(None);
    };
    let Some(mime) = sniff(&bytes) else {
        let _ = fs::remove_file(&path);
        return Ok(None);
    };
    // Read just now: the last to go when the folder is tidied.
    if let Ok(file) = fs::File::options().write(true).open(&path) {
        let _ = file.set_modified(SystemTime::now());
    }
    Ok(Some(Cached {
        mime,
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    }))
}

fn write(dir: &Path, version: &Version, base64: &str) -> Result<(), String> {
    let key = key(version);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64)
        .map_err(|_| "The preview is not an image.".to_string())?;
    if bytes.len() > MAX_IMAGE || sniff(&bytes).is_none() {
        return Err("The preview is not an image.".into());
    }
    fs::create_dir_all(dir).map_err(error)?;
    // Whole or not at all: a half-written image would show as a broken card.
    let partial = dir.join(format!(
        ".{key}-{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|time| time.as_nanos())
            .unwrap_or_default()
    ));
    fs::write(&partial, &bytes).map_err(error)?;
    if let Err(cause) = fs::rename(&partial, dir.join(key)) {
        let _ = fs::remove_file(&partial);
        return Err(error(cause));
    }
    if WRITES.fetch_add(1, Ordering::Relaxed) % PRUNE_EVERY == 0 {
        prune(dir, MAX_TOTAL);
    }
    Ok(())
}

/// Removes the least recently read images until the rest fit in `budget`.
fn prune(dir: &Path, budget: u64) {
    let Ok(items) = fs::read_dir(dir) else {
        return;
    };
    let mut images: Vec<(SystemTime, u64, PathBuf)> = items
        .flatten()
        .filter_map(|item| {
            let meta = item.metadata().ok()?;
            meta.is_file().then(|| {
                (
                    meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                    meta.len(),
                    item.path(),
                )
            })
        })
        .collect();
    images.sort_by_key(|image| std::cmp::Reverse(image.0));
    let mut kept = 0u64;
    for (_, size, path) in images {
        kept += size;
        if kept > budget {
            let _ = fs::remove_file(path);
        }
    }
}

fn folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(error)?.join("previews"))
}

/// The image kept for this version of a file, or `None` when there is none yet.
#[tauri::command]
pub async fn preview_cache_read(
    app: tauri::AppHandle,
    version: Version,
) -> Result<Option<Cached>, String> {
    let dir = folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || read(&dir, &version))
        .await
        .map_err(error)?
}

/// Keeps a card's image, base64-encoded WebP, JPEG or PNG, for this version
/// of a file.
#[tauri::command]
pub async fn preview_cache_write(
    app: tauri::AppHandle,
    version: Version,
    base64: String,
) -> Result<(), String> {
    let dir = folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || write(&dir, &version, &base64))
        .await
        .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    const WEBP: &[u8] = b"RIFF\x04\0\0\0WEBPVP8 ";

    struct Folder(PathBuf);
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    impl Folder {
        fn new() -> Self {
            Folder(std::env::temp_dir().join(format!(
                "unipilot-previews-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            )))
        }
    }
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn encode(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn slides(modified: u64) -> Version {
        Version {
            path: "Logik/ILIAS/Folien.pdf".into(),
            modified,
            size: 1200,
        }
    }

    #[test]
    fn keeps_an_image_and_gives_it_back() {
        let folder = Folder::new();
        assert_eq!(read(&folder.0, &slides(1)).unwrap(), None);
        write(&folder.0, &slides(1), &encode(WEBP)).unwrap();
        assert_eq!(
            read(&folder.0, &slides(1)).unwrap(),
            Some(Cached {
                mime: "image/webp",
                base64: encode(WEBP)
            })
        );
        // No half-written file stays beside it.
        assert_eq!(fs::read_dir(&folder.0).unwrap().count(), 1);
    }

    #[test]
    fn a_changed_file_has_no_image_yet() {
        let folder = Folder::new();
        write(&folder.0, &slides(1), &encode(WEBP)).unwrap();
        assert_eq!(read(&folder.0, &slides(2)).unwrap(), None);
        let resized = Version {
            size: 1300,
            ..slides(1)
        };
        assert_eq!(read(&folder.0, &resized).unwrap(), None);
    }

    #[test]
    fn names_images_by_hash_never_by_path() {
        let name = key(&Version {
            path: "../../secrets".into(),
            modified: 1,
            size: 1,
        });
        assert_eq!(name.len(), 64);
        assert!(name.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }

    #[test]
    fn takes_only_images() {
        let folder = Folder::new();
        let version = slides(1);
        assert!(write(&folder.0, &version, &encode(b"<script>")).is_err());
        assert!(write(&folder.0, &version, "not base64!").is_err());
        assert!(write(&folder.0, &version, &encode(&[0xff, 0xd8, 0xff, 0xe0])).is_ok());
        assert!(write(&folder.0, &version, &encode(b"\x89PNG\r\n\x1a\n")).is_ok());
    }

    #[test]
    fn tidies_away_the_images_read_least_recently() {
        let folder = Folder::new();
        fs::create_dir_all(&folder.0).unwrap();
        let old = SystemTime::now() - Duration::from_secs(3600);
        for (index, name) in ["a", "b", "c"].iter().enumerate() {
            let path = folder.0.join(name);
            fs::write(&path, [0u8; 100]).unwrap();
            let file = fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(old + Duration::from_secs(index as u64 * 60))
                .unwrap();
        }
        prune(&folder.0, 250);
        let mut left: Vec<String> = fs::read_dir(&folder.0)
            .unwrap()
            .map(|item| item.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left, ["b", "c"]);
    }
}
