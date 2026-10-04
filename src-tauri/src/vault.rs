//! What signing in automatically needs, kept by the platform.
//!
//! Opt-in, off until the student sets it up in Settings
//! (`docs/face-unlock-plan.md`). Two entries under the app's identifier, in
//! the Keychain on macOS, the Credential Manager on Windows and the Secret
//! Service on Linux — never in a file:
//!
//! - `ilias-sign-in:<ILIAS host>`: the HHN user name and password, and Uni
//!   Pilot's **own** authenticator at HHN — a second one next to the
//!   student's phone, with its own name, so it can be removed at HHN alone.
//! - `face-template`: the face, as 128 numbers (written in a later phase).
//!
//! Two entries because Windows caps one secret at 2560 bytes.
//!
//! Secrets stay in Rust. The page may save them and ask whether they exist;
//! it never gets the password or the authenticator back, and nothing here
//! logs them. They are wiped from memory when dropped.

use serde::{Deserialize, Serialize};
use tauri::Url;
use totp_rs::{Builder, Secret, Totp, TotpError};
use zeroize::{Zeroize, Zeroizing};

const SERVICE: &str = "com.unipilot.desktop";
const FACE: &str = "face-template";
/// What Uni Pilot's authenticator is called at HHN unless the student chose
/// otherwise; the code page lists authenticators by this name.
const DEFAULT_DEVICE: &str = "Uni Pilot";

/// Why the vault could not help. The page decides what to say from the kind.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum VaultError {
    /// The input cannot be used. The message never repeats it.
    Invalid(String),
    /// The student declined when the platform asked whether Uni Pilot may use
    /// its entry — on macOS after every update, as long as Uni Pilot is
    /// signed ad hoc.
    Refused,
    /// The platform's store could not be used: no keyring running on Linux, a
    /// locked or damaged Keychain.
    Unavailable(String),
}

/// What signing in needs. No `Debug`, never sent to the page.
#[derive(Serialize, Deserialize)]
pub(crate) struct Credentials {
    pub username: String,
    pub password: String,
    /// An `otpauth://totp/…` link, so algorithm, digits and period come along.
    pub otpauth: String,
    /// The name of Uni Pilot's authenticator at HHN.
    pub device: String,
    /// HHN refused the password. Set by the sign-in; the face is not asked
    /// again until the student updates the password.
    #[serde(default)]
    pub stale: bool,
}

impl Drop for Credentials {
    fn drop(&mut self) {
        self.password.zeroize();
        self.otpauth.zeroize();
    }
}

/// What the page may know.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    credentials: bool,
    username: Option<String>,
    device: Option<String>,
    stale: bool,
    face: bool,
}

/// Where entries live: the platform's store in the app, a map in tests.
pub(crate) trait Store {
    fn read(&self, key: &str) -> Result<Option<Zeroizing<String>>, VaultError>;
    fn write(&self, key: &str, value: &str) -> Result<(), VaultError>;
    fn remove(&self, key: &str) -> Result<(), VaultError>;
}

/// The Keychain, Credential Manager or Secret Service, through `keyring`.
pub(crate) struct Platform;

impl Platform {
    fn entry(key: &str) -> Result<keyring::Entry, VaultError> {
        keyring::Entry::new(SERVICE, key).map_err(platform_error)
    }
}

impl Store for Platform {
    fn read(&self, key: &str) -> Result<Option<Zeroizing<String>>, VaultError> {
        match Self::entry(key)?.get_password() {
            Ok(value) => Ok(Some(Zeroizing::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(platform_error(error)),
        }
    }

    fn write(&self, key: &str, value: &str) -> Result<(), VaultError> {
        Self::entry(key)?.set_password(value).map_err(platform_error)
    }

    fn remove(&self, key: &str) -> Result<(), VaultError> {
        match Self::entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(platform_error(error)),
        }
    }
}

/// `keyring` reports Deny and Cancel in the Keychain's prompt as a plain
/// platform failure; the Keychain's own code tells them apart.
fn platform_error(error: keyring::Error) -> VaultError {
    #[cfg(target_os = "macos")]
    if let keyring::Error::PlatformFailure(inner) = &error {
        if let Some(keychain) = inner.downcast_ref::<security_framework::base::Error>() {
            // errSecUserCanceled, errSecAuthFailed
            if matches!(keychain.code(), -128 | -25293) {
                return VaultError::Refused;
            }
        }
    }
    VaultError::Unavailable(error.to_string())
}

fn sign_in_key(host: &str) -> String {
    format!("ilias-sign-in:{host}")
}

/// The ILIAS host the entry belongs to.
fn host(base_url: &str) -> Result<String, VaultError> {
    Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
        .ok_or_else(|| VaultError::Invalid("That is not an ILIAS address.".into()))
}

/// Uni Pilot's authenticator from what the student pasted: the
/// `otpauth://totp/…` link behind HHN's QR code, or the bare secret HHN shows
/// under "Unable to scan?" — then with Keycloak's defaults, SHA-1, six digits,
/// thirty seconds. Returns the link to store.
pub(crate) fn authenticator(input: &str) -> Result<Zeroizing<String>, VaultError> {
    let input = input.trim();
    if input.to_ascii_lowercase().starts_with("otpauth:") {
        Totp::from_url(input).map_err(refused_link)?;
        return Ok(Zeroizing::new(input.to_owned()));
    }
    let compact = Zeroizing::new(input.split_whitespace().collect::<String>().to_ascii_uppercase());
    let secret = Secret::try_from_base32(compact.as_str()).map_err(|_| {
        VaultError::Invalid("That is neither an authenticator link nor a secret from HHN.".into())
    })?;
    let totp = Builder::new()
        .with_secret(secret)
        .with_issuer(Some("HHN"))
        .with_account_name(DEFAULT_DEVICE)
        .build()
        .map_err(refused_link)?;
    Ok(Zeroizing::new(totp.to_url().map_err(refused_link)?))
}

fn refused_link(error: TotpError) -> VaultError {
    VaultError::Invalid(
        match error {
            TotpError::InvalidHost { host } if host == "hotp" => {
                "That authenticator counts uses (HOTP); HHN's change every thirty seconds (TOTP)."
            }
            TotpError::SecretNotSet => "The authenticator link has no secret in it.",
            TotpError::SecretTooShort { .. } => "That secret is too short to be one from HHN.",
            _ => "That is neither an authenticator link nor a secret from HHN.",
        }
        .into(),
    )
}

/// What an authenticator shows now, and for how many more seconds.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentCode {
    code: String,
    valid_for: u64,
}

fn current_code(input: &str) -> Result<CurrentCode, VaultError> {
    let link = authenticator(input)?;
    let totp = Totp::from_url(link.as_str()).map_err(refused_link)?;
    Ok(CurrentCode {
        code: totp.generate_current().to_string(),
        valid_for: totp.ttl(),
    })
}

/// The code for an authenticator being set up: HHN asks for one before it
/// accepts a new authenticator. Made from what the student just entered;
/// nothing is stored and the store is not read, so a stored authenticator's
/// codes never reach the page.
#[tauri::command]
pub fn auto_sign_in_code(authenticator: String) -> Result<CurrentCode, VaultError> {
    let authenticator = Zeroizing::new(authenticator);
    current_code(&authenticator)
}

/// The code the authenticator shows right now.
pub(crate) fn code(otpauth: &str) -> Result<Zeroizing<String>, VaultError> {
    let totp = Totp::from_url(otpauth).map_err(refused_link)?;
    Ok(Zeroizing::new(totp.generate_current().to_string()))
}

pub(crate) fn credentials_in(store: &dyn Store, host: &str) -> Result<Option<Credentials>, VaultError> {
    let Some(json) = store.read(&sign_in_key(host))? else {
        return Ok(None);
    };
    serde_json::from_str(&json)
        .map(Some)
        .map_err(|_| VaultError::Unavailable("The stored sign-in could not be read.".into()))
}

fn status_in(store: &dyn Store, host: &str) -> Result<Status, VaultError> {
    let credentials = credentials_in(store, host)?;
    Ok(Status {
        credentials: credentials.is_some(),
        username: credentials.as_ref().map(|c| c.username.clone()),
        device: credentials.as_ref().map(|c| c.device.clone()),
        stale: credentials.as_ref().is_some_and(|c| c.stale),
        face: store.read(FACE)?.is_some(),
    })
}

fn save_in(
    store: &dyn Store,
    host: &str,
    username: &str,
    password: &str,
    authenticator_input: &str,
    device: Option<&str>,
) -> Result<Status, VaultError> {
    let username = username.trim();
    if username.is_empty() {
        return Err(VaultError::Invalid("Your HHN user name is missing.".into()));
    }
    if password.is_empty() {
        return Err(VaultError::Invalid("Your HHN password is missing.".into()));
    }
    let device = device.map(str::trim).filter(|d| !d.is_empty()).unwrap_or(DEFAULT_DEVICE);
    if device.chars().count() > 64 {
        return Err(VaultError::Invalid("The authenticator's name is too long.".into()));
    }
    let credentials = Credentials {
        username: username.to_owned(),
        password: password.to_owned(),
        otpauth: authenticator(authenticator_input)?.to_string(),
        device: device.to_owned(),
        stale: false,
    };
    let json = Zeroizing::new(
        serde_json::to_string(&credentials)
            .map_err(|_| VaultError::Unavailable("The sign-in could not be stored.".into()))?,
    );
    store.write(&sign_in_key(host), &json)?;
    status_in(store, host)
}

fn mark_stale_in(store: &dyn Store, host: &str) -> Result<(), VaultError> {
    let Some(mut credentials) = credentials_in(store, host)? else {
        return Ok(());
    };
    credentials.stale = true;
    let json = Zeroizing::new(
        serde_json::to_string(&credentials)
            .map_err(|_| VaultError::Unavailable("The sign-in could not be stored.".into()))?,
    );
    store.write(&sign_in_key(host), &json)
}

fn save_face_in(store: &dyn Store, template: &[u8]) -> Result<(), VaultError> {
    use base64::Engine;
    let encoded = Zeroizing::new(base64::engine::general_purpose::STANDARD.encode(template));
    store.write(FACE, &encoded)
}

fn face_in(store: &dyn Store) -> Result<Option<Zeroizing<Vec<u8>>>, VaultError> {
    use base64::Engine;
    let Some(encoded) = store.read(FACE)? else {
        return Ok(None);
    };
    base64::engine::general_purpose::STANDARD
        .decode(encoded.as_bytes())
        .map(|bytes| Some(Zeroizing::new(bytes)))
        .map_err(|_| VaultError::Unavailable("The stored face could not be read.".into()))
}

fn forget_in(store: &dyn Store, host: &str) -> Result<(), VaultError> {
    store.remove(&sign_in_key(host))?;
    store.remove(FACE)
}

/// Platform stores can block on a prompt for as long as the student takes to
/// answer it; that is no place for the async runtime's threads.
async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, VaultError> + Send + 'static,
) -> Result<T, VaultError> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| VaultError::Unavailable(error.to_string()))?
}

/// Whether signing in automatically is set up for this ILIAS — never the
/// password or the authenticator.
#[tauri::command]
pub async fn auto_sign_in_status(base_url: String) -> Result<Status, VaultError> {
    let host = host(&base_url)?;
    blocking(move || status_in(&Platform, &host)).await
}

/// Checks and stores what signing in needs, replacing what was there.
#[tauri::command]
pub async fn auto_sign_in_save(
    base_url: String,
    username: String,
    password: String,
    authenticator: String,
    device: Option<String>,
) -> Result<Status, VaultError> {
    let host = host(&base_url)?;
    let (password, authenticator) = (Zeroizing::new(password), Zeroizing::new(authenticator));
    blocking(move || {
        save_in(
            &Platform,
            &host,
            &username,
            &password,
            &authenticator,
            device.as_deref(),
        )
    })
    .await
}

/// What signing in needs, for the sign-in in Rust (`ilias_sync::sign_in`) —
/// never for the page.
pub(crate) async fn stored_sign_in(base_url: &str) -> Result<Option<Credentials>, VaultError> {
    let host = host(base_url)?;
    blocking(move || credentials_in(&Platform, &host)).await
}

/// HHN refused the stored password: it is not sent again until the student
/// saves a new one, which clears the mark.
pub(crate) async fn mark_stale(base_url: &str) -> Result<(), VaultError> {
    let host = host(base_url)?;
    blocking(move || mark_stale_in(&Platform, &host)).await
}

/// Keeps the face template (`face_unlock::embed::to_bytes`), replacing the
/// one before. Never sent to the page.
pub(crate) async fn save_face(template: Vec<u8>) -> Result<(), VaultError> {
    let template = Zeroizing::new(template);
    blocking(move || save_face_in(&Platform, &template)).await
}

/// The face template, for an unlock in Rust — never for the page.
pub(crate) async fn stored_face() -> Result<Option<Zeroizing<Vec<u8>>>, VaultError> {
    blocking(|| face_in(&Platform)).await
}

/// Forgets the sign-in and the face at once.
#[tauri::command]
pub async fn auto_sign_in_forget(base_url: String) -> Result<(), VaultError> {
    let host = host(&base_url)?;
    blocking(move || forget_in(&Platform, &host)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    /// The platform's store, as a map.
    #[derive(Default)]
    struct Memory(RefCell<HashMap<String, String>>);

    impl Store for Memory {
        fn read(&self, key: &str) -> Result<Option<Zeroizing<String>>, VaultError> {
            Ok(self.0.borrow().get(key).cloned().map(Zeroizing::new))
        }
        fn write(&self, key: &str, value: &str) -> Result<(), VaultError> {
            self.0.borrow_mut().insert(key.into(), value.into());
            Ok(())
        }
        fn remove(&self, key: &str) -> Result<(), VaultError> {
            self.0.borrow_mut().remove(key);
            Ok(())
        }
    }

    const HOST: &str = "ilias.hs-heilbronn.de";
    /// RFC 4226's test key, "12345678901234567890", in base32.
    const RFC_SECRET: &str = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    #[test]
    fn generates_the_rfc_6238_codes() {
        // RFC 6238, appendix B, SHA-1 — the last six of each eight digits.
        let totp = Totp::from_url(format!("otpauth://totp/HHN:x?secret={RFC_SECRET}")).unwrap();
        for (time, code) in [
            (59, "287082"),
            (1_111_111_109, "081804"),
            (1_111_111_111, "050471"),
            (1_234_567_890, "005924"),
            (2_000_000_000, "279037"),
            (20_000_000_000, "353130"),
        ] {
            assert_eq!(totp.generate(time).to_string(), code, "at {time}");
        }
    }

    #[test]
    fn accepts_a_keycloak_link_and_keeps_it() {
        let link = format!("otpauth://totp/hhn:student?secret={RFC_SECRET}&digits=6&algorithm=SHA1&issuer=hhn&period=30");
        assert_eq!(authenticator(&link).unwrap().as_str(), link);
    }

    #[test]
    fn turns_a_bare_secret_into_a_link_with_keycloaks_defaults() {
        let spaced = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq";
        let link = authenticator(spaced).unwrap();
        let totp = Totp::from_url(link.as_str()).unwrap();
        assert_eq!(totp.generate(59).to_string(), "287082");
        assert!(link.contains("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), "{}", *link);
    }

    #[test]
    fn refuses_what_hhn_would_never_give() {
        let cases = [
            (format!("otpauth://hotp/HHN:x?secret={RFC_SECRET}&counter=0"), "HOTP"),
            ("otpauth://totp/HHN:x?digits=6".to_string(), "no secret"),
            ("not a secret at all!".to_string(), "neither"),
            ("JBSWY3DP".to_string(), "too short"),
        ];
        for (input, expected) in cases {
            match authenticator(&input) {
                Err(VaultError::Invalid(message)) => {
                    assert!(message.contains(expected), "{input}: {message}");
                    assert!(!message.contains(&input), "the message repeats the input");
                }
                other => panic!("{input}: {:?}", other.map(|_| ())),
            }
        }
    }

    #[test]
    fn stores_reads_back_and_forgets() {
        let store = Memory::default();
        store.write(FACE, "template").unwrap();
        let status = save_in(&store, HOST, " student ", "hunter2", RFC_SECRET, None).unwrap();
        assert_eq!(
            status,
            Status {
                credentials: true,
                username: Some("student".into()),
                device: Some("Uni Pilot".into()),
                stale: false,
                face: true,
            }
        );
        let stored = credentials_in(&store, HOST).unwrap().unwrap();
        assert_eq!(stored.password, "hunter2");
        assert_eq!(code(&stored.otpauth).unwrap().len(), 6);

        forget_in(&store, HOST).unwrap();
        assert!(store.0.borrow().is_empty(), "forget leaves nothing behind");
    }

    #[test]
    fn the_status_never_carries_a_secret() {
        let store = Memory::default();
        let status = save_in(&store, HOST, "student", "hunter2", RFC_SECRET, Some("Laptop")).unwrap();
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("hunter2"), "{json}");
        assert!(!json.contains(RFC_SECRET), "{json}");
        assert!(!json.contains("otpauth"), "{json}");
        assert!(json.contains("\"device\":\"Laptop\""), "{json}");
    }

    #[test]
    fn keeps_the_face_apart_and_forgets_it_with_the_sign_in() {
        let store = Memory::default();
        save_in(&store, HOST, "student", "hunter2", RFC_SECRET, None).unwrap();
        assert_eq!(face_in(&store).unwrap(), None);

        let template: Vec<u8> = (0..=255u8).chain(0..=255u8).collect();
        save_face_in(&store, &template).unwrap();
        assert_eq!(face_in(&store).unwrap().as_deref(), Some(&template));
        assert!(status_in(&store, HOST).unwrap().face);
        let json = serde_json::to_string(&status_in(&store, HOST).unwrap()).unwrap();
        assert!(!json.contains(&base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &template
        )));

        forget_in(&store, HOST).unwrap();
        assert_eq!(face_in(&store).unwrap(), None);
    }

    /// HHN's set-up asks for a code from the new authenticator.
    #[test]
    fn shows_the_code_of_an_authenticator_being_set_up() {
        // RFC 4226's key with a period past 2096: counter 0's code.
        let link = format!("otpauth://totp/HHN:x?secret={RFC_SECRET}&period=4000000000");
        let shown = current_code(&link).unwrap();
        assert_eq!(shown.code, "755224");
        assert!(shown.valid_for > 0);

        let bare = current_code("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").unwrap();
        assert_eq!(bare.code.len(), 6);
        assert!((1..=30).contains(&bare.valid_for));

        assert!(matches!(
            current_code("not a secret"),
            Err(VaultError::Invalid(_))
        ));
    }

    #[test]
    fn marks_a_refused_password_until_it_is_saved_again() {
        let store = Memory::default();
        mark_stale_in(&store, HOST).unwrap();
        assert!(store.0.borrow().is_empty(), "nothing to mark, nothing written");

        save_in(&store, HOST, "student", "hunter2", RFC_SECRET, None).unwrap();
        mark_stale_in(&store, HOST).unwrap();
        assert!(status_in(&store, HOST).unwrap().stale);
        let kept = credentials_in(&store, HOST).unwrap().unwrap();
        assert_eq!(kept.password, "hunter2", "the rest stays as it was");

        let saved = save_in(&store, HOST, "student", "hunter3", RFC_SECRET, None).unwrap();
        assert!(!saved.stale);
    }

    #[test]
    fn refuses_to_store_without_name_or_password() {
        let store = Memory::default();
        for (name, password) in [("  ", "pw"), ("student", "")] {
            assert!(matches!(
                save_in(&store, HOST, name, password, RFC_SECRET, None),
                Err(VaultError::Invalid(_))
            ));
        }
        assert!(store.0.borrow().is_empty());
    }

    #[test]
    fn keys_the_entry_by_ilias_host() {
        assert_eq!(host("https://ILIAS.hs-heilbronn.de/").unwrap(), HOST);
        assert!(matches!(host("not a url"), Err(VaultError::Invalid(_))));
    }
}
