//! The newest university mail, kept on this Mac so the Inbox opens at once.
//!
//! Apple Mail answers one question at a time (`apple_mail.rs`), so without a
//! copy the Inbox waits at every start: for the list, then the previews, then
//! each text as it is opened. Uni Pilot keeps the list it last showed and the
//! text of the newest messages, shows them straight away, and asks Mail for
//! what is new behind them. The page decides what goes in; this file keeps it
//! small, encrypted and short-lived:
//!
//! - **Encrypted.** AES-256-GCM, with a key in the Keychain. Mail's own copy in
//!   `~/Library/Mail` is shielded from other apps by macOS; Uni Pilot's data
//!   folder is not, so the file is unreadable without the key. macOS asks once
//!   whether Uni Pilot may use it — and again after an update, as an ad-hoc
//!   signed build is a new app to the Keychain. Refused, nothing is kept.
//! - **Little.** At most `LIST_MAX` listed messages and the text of
//!   `TEXTS_MAX` of them, each no longer than Mail's own answer.
//! - **Not for long.** A copy left untouched for `KEPT_DAYS` days is deleted
//!   rather than read. Switching account or turning it off in Settings deletes
//!   it at once.
//!
//! On Windows and Linux there is no university mail, so nothing is kept.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::apple_mail::MailBody;

/// The Inbox lists the newest 50 (`INBOX_LIMIT` in `apple_mail.rs`).
const LIST_MAX: usize = 50;
/// Texts kept: about a week of university mail.
const TEXTS_MAX: usize = 25;
/// The longest text Mail hands back (`CONTENT_MAX` in `apple_mail.js`).
const TEXT_MAX: usize = 100_000;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const KEPT_DAYS: u64 = 30;
/// Marks the file's format; also bound into the encryption, so a file of
/// another format cannot pass for this one.
const MAGIC: &[u8] = b"UPM1";

/// What the Inbox keeps: the list as it showed it, and the newest texts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailCache {
    /// The Mail account it came from; another account's copy is not shown.
    pub account: String,
    /// The listed messages as the page shows them, previews included.
    pub messages: Vec<Value>,
    pub bodies: Vec<MailBody>,
}

/// Holds the page to the limits, whatever it sends.
fn check_cache(cache: &MailCache) -> Result<(), String> {
    if cache.account.trim().is_empty() {
        return Err("A copy needs the account it came from.".into());
    }
    if cache.messages.len() > LIST_MAX {
        return Err(format!("At most {LIST_MAX} messages are kept."));
    }
    if cache.bodies.len() > TEXTS_MAX {
        return Err(format!("At most {TEXTS_MAX} texts are kept."));
    }
    if cache
        .bodies
        .iter()
        .any(|body| body.content.chars().count() > TEXT_MAX)
    {
        return Err("A text is longer than Mail hands back.".into());
    }
    Ok(())
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn seal(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
    use ring::rand::{SecureRandom, SystemRandom};

    let sealing =
        LessSafeKey::new(UnboundKey::new(&AES_256_GCM, key).map_err(|_| "The key is not usable.")?);
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| "No randomness for the encryption.")?;
    let mut data = plain.to_vec();
    sealing
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce),
            Aad::from(MAGIC),
            &mut data,
        )
        .map_err(|_| "The copy could not be encrypted.")?;
    let mut sealed = Vec::with_capacity(MAGIC.len() + NONCE_LEN + data.len());
    sealed.extend_from_slice(MAGIC);
    sealed.extend_from_slice(&nonce);
    sealed.extend_from_slice(&data);
    Ok(sealed)
}

/// The plain bytes, or `None` for a file that is not this format, not from
/// this key, or changed since.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn open(key: &[u8; 32], sealed: &[u8]) -> Option<Vec<u8>> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};

    let rest = sealed.strip_prefix(MAGIC)?;
    if rest.len() < NONCE_LEN {
        return None;
    }
    let (nonce, data) = rest.split_at(NONCE_LEN);
    let opening = LessSafeKey::new(UnboundKey::new(&AES_256_GCM, key).ok()?);
    let mut data = data.to_vec();
    let plain = opening
        .open_in_place(
            Nonce::try_assume_unique_for_key(nonce).ok()?,
            Aad::from(MAGIC),
            &mut data,
        )
        .ok()?;
    Some(plain.to_vec())
}

#[cfg(target_os = "macos")]
mod store {
    use super::{open, seal, MailCache, KEPT_DAYS};
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::{Duration, SystemTime};
    use tauri::Manager;

    const SERVICE: &str = "com.unipilot.desktop.mail-cache";
    const USER: &str = "key";

    /// The key once read this session, so the Keychain is asked once.
    static KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);
    /// One write at a time; the page may save twice in a moment.
    static WRITING: Mutex<()> = Mutex::new(());

    fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        Ok(app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("mail-cache.bin"))
    }

    /// The key from the Keychain. `create` makes one when there is none —
    /// only for writing: reading without a key just finds no copy.
    fn key(create: bool) -> Result<Option<[u8; 32]>, String> {
        let mut known = KEY.lock().map_err(|_| "The key is unavailable.")?;
        if let Some(key) = *known {
            return Ok(Some(key));
        }
        let entry = keyring::Entry::new(SERVICE, USER).map_err(|error| error.to_string())?;
        let stored = match entry.get_secret() {
            Ok(secret) => <[u8; 32]>::try_from(secret.as_slice()).ok(),
            Err(keyring::Error::NoEntry) => None,
            // Refused in the Keychain's dialog, or a Keychain that is locked:
            // keep nothing rather than make a key that replaces the old one.
            Err(error) => return Err(error.to_string()),
        };
        let key = match stored {
            Some(key) => key,
            None if create => {
                use ring::rand::{SecureRandom, SystemRandom};
                let mut fresh = [0u8; 32];
                SystemRandom::new()
                    .fill(&mut fresh)
                    .map_err(|_| "No randomness for a key.")?;
                entry
                    .set_secret(&fresh)
                    .map_err(|error| error.to_string())?;
                fresh
            }
            None => return Ok(None),
        };
        *known = Some(key);
        Ok(Some(key))
    }

    pub fn read(app: &tauri::AppHandle) -> Result<Option<MailCache>, String> {
        let path = path(app)?;
        let Ok(metadata) = std::fs::metadata(&path) else {
            return Ok(None);
        };
        let age = metadata
            .modified()
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .unwrap_or_default();
        if age > Duration::from_secs(KEPT_DAYS * 24 * 60 * 60) {
            let _ = std::fs::remove_file(&path);
            return Ok(None);
        }
        let Some(key) = key(false)? else {
            return Ok(None);
        };
        let sealed = std::fs::read(&path).map_err(|error| error.to_string())?;
        // Not from this key, or not whole: it is of no use to anyone.
        let Some(cache) =
            open(&key, &sealed).and_then(|plain| serde_json::from_slice::<MailCache>(&plain).ok())
        else {
            let _ = std::fs::remove_file(&path);
            return Ok(None);
        };
        Ok(Some(cache))
    }

    pub fn write(app: &tauri::AppHandle, cache: &MailCache) -> Result<(), String> {
        let path = path(app)?;
        let key = key(true)?.ok_or("No key to encrypt with.")?;
        let plain = serde_json::to_vec(cache).map_err(|error| error.to_string())?;
        let sealed = seal(&key, &plain)?;

        let _one_at_a_time = WRITING.lock().map_err(|_| "Another save went wrong.")?;
        if let Some(directory) = path.parent() {
            std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        }
        // Readable by this user only, and whole or not at all.
        let temporary = path.with_extension("bin.tmp");
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&sealed)
            .and_then(|()| file.sync_all())
            .map_err(|error| error.to_string())?;
        std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
    }

    pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
        let _one_at_a_time = WRITING.lock().map_err(|_| "Another save went wrong.")?;
        match std::fs::remove_file(path(app)?) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
            _ => Ok(()),
        }
    }
}

/// Nothing is kept where there is no university mail.
#[cfg(not(target_os = "macos"))]
mod store {
    use super::MailCache;

    pub fn read(_app: &tauri::AppHandle) -> Result<Option<MailCache>, String> {
        Ok(None)
    }

    pub fn write(_app: &tauri::AppHandle, _cache: &MailCache) -> Result<(), String> {
        Ok(())
    }

    pub fn clear(_app: &tauri::AppHandle) -> Result<(), String> {
        Ok(())
    }
}

/// Off the async runtime: the Keychain may ask the student, and waits.
async fn in_background<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

/// The copy kept on this Mac, if there is one for Uni Pilot to read.
#[tauri::command]
pub async fn mail_cache_read(app: tauri::AppHandle) -> Result<Option<MailCache>, String> {
    in_background(move || store::read(&app)).await
}

/// Replaces the copy with what the Inbox shows now.
#[tauri::command]
pub async fn mail_cache_write(app: tauri::AppHandle, cache: MailCache) -> Result<(), String> {
    check_cache(&cache)?;
    in_background(move || store::write(&app, &cache)).await
}

/// Deletes the copy. The key stays in the Keychain for the next one.
#[tauri::command]
pub async fn mail_cache_clear(app: tauri::AppHandle) -> Result<(), String> {
    in_background(move || store::clear(&app)).await
}

#[cfg(test)]
mod tests {
    use super::{check_cache, open, seal, MailCache, TEXTS_MAX};
    use crate::apple_mail::MailBody;

    const KEY: [u8; 32] = [7; 32];

    fn body(id: &str, content: &str) -> MailBody {
        MailBody {
            id: id.into(),
            subject: "Blatt 4".into(),
            sender: "Prof. Beispiel <prof@hs-heilbronn.de>".into(),
            to: vec!["student@stud.hs-heilbronn.de".into()],
            cc: vec![],
            received_at: Some("2026-09-25T09:12:00.000Z".into()),
            read: false,
            content: content.into(),
            attachments: vec![],
        }
    }

    fn cache(texts: usize) -> MailCache {
        MailCache {
            account: "stud.hs-heilbronn.de".into(),
            messages: vec![serde_json::json!({ "id": "a@hs-heilbronn.de", "subject": "Blatt 4" })],
            bodies: (0..texts)
                .map(|n| body(&format!("m{n}@hs-heilbronn.de"), "Guten Tag,"))
                .collect(),
        }
    }

    #[test]
    fn opens_what_it_sealed_and_shows_nothing_in_the_clear() {
        let plain = serde_json::to_vec(&cache(1)).unwrap();
        let sealed = seal(&KEY, &plain).unwrap();
        assert!(!sealed
            .windows(b"Guten Tag".len())
            .any(|w| w == b"Guten Tag"));
        assert_eq!(open(&KEY, &sealed), Some(plain));
    }

    #[test]
    fn seals_the_same_copy_differently_each_time() {
        let plain = b"Guten Tag,";
        assert_ne!(seal(&KEY, plain).unwrap(), seal(&KEY, plain).unwrap());
    }

    #[test]
    fn opens_nothing_with_another_key_or_after_a_change() {
        let sealed = seal(&KEY, b"Guten Tag,").unwrap();
        assert_eq!(open(&[8; 32], &sealed), None);

        let mut changed = sealed.clone();
        *changed.last_mut().unwrap() ^= 1;
        assert_eq!(open(&KEY, &changed), None);

        assert_eq!(open(&KEY, b"UPM1"), None);
        assert_eq!(open(&KEY, b"not a copy at all"), None);
    }

    #[test]
    fn keeps_only_a_little() {
        assert_eq!(check_cache(&cache(TEXTS_MAX)), Ok(()));
        assert!(check_cache(&cache(TEXTS_MAX + 1)).is_err());

        let crowded = MailCache {
            messages: (0..51).map(|n| serde_json::json!({ "id": n })).collect(),
            ..cache(0)
        };
        assert!(check_cache(&crowded).is_err());

        let long = MailCache {
            bodies: vec![body("a@b.de", &"x".repeat(100_001))],
            ..cache(0)
        };
        assert!(check_cache(&long).is_err());

        let nobody = MailCache {
            account: " ".into(),
            ..cache(0)
        };
        assert!(check_cache(&nobody).is_err());
    }
}
