//! Signing in to the university's sign-on for the student — the step face
//! unlock leads to (`docs/face-unlock-plan.md`, Phase 2). Opt-in: nothing here
//! runs unless the student stored their sign-in in the vault.
//!
//! - `keycloak`: the sign-on's pages, told apart by their form ids, and the
//!   way in over HTTP — ILIAS's OIDC entry, the password, the code, and a stop
//!   at the redirect back to ILIAS.
//! - `jar`: the cookies of that one sign-in, in memory.
//! - `handoff`: the sign-on's cookies into the webview's store, then
//!   `reauth::renew` makes the ILIAS session the usual way.
//!
//! At most one password POST and one code POST per sign-in, and neither is
//! ever sent again: the sign-on locks an account after repeated failures. A
//! page the sign-in does not know ends it before anything more is sent.
//!
//! Rust talks to the sign-on itself; nothing is typed into a webview and no
//! script runs in one. The values come in as arguments — whoever calls has
//! read the vault, once the student's face or click allowed it — and none of
//! them is logged: logs carry pages by kind and cookies by name.

mod handoff;
mod jar;
mod keycloak;

use serde::Serialize;
use tauri::Url;

use crate::ilias_window::resolve_target;
use crate::vault::{self, Credentials, VaultError};

/// The sign-on each ILIAS sends its students to, by ILIAS host. Chosen here,
/// never by the page: a page that could name the sign-on could send the stored
/// password anywhere. One entry, like `knownInstallations.ts`.
const SIGN_ONS: [(&str, &str); 1] = [(
    "ilias.hs-heilbronn.de",
    "https://login.hs-heilbronn.de/realms/hhn",
)];

/// Why signing in automatically did not work. The page decides what to offer
/// from the kind, as for `SyncError`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum SignInError {
    /// Nothing is stored for this ILIAS: signing in automatically is not set up.
    NotSetUp,
    /// HHN refused the user name or password — or locked the account for a
    /// while; Keycloak says the same for all three.
    WrongPassword,
    /// HHN refused the code from Uni Pilot's authenticator.
    WrongCode,
    /// The sign-on showed a page the sign-in does not know, or one that leads
    /// somewhere it does not go. Nothing more was sent.
    Unrecognised(String),
    /// The sign-on could not be reached, or was busy.
    Unreachable(String),
    /// Uni Pilot could not do its part on this computer.
    Local(String),
}

/// Development builds only, for now: the "Test sign-in" button next to "Sign
/// in to ILIAS", Phase 2's check against a real account. Signs in with what
/// the vault holds for this ILIAS; `true` when ILIAS has a session again.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn sign_in_to_ilias(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
) -> Result<bool, SignInError> {
    sign_in_stored(&app, &base_url, &client_id).await
}

/// Signs in with the student's stored values. A password HHN refused once is
/// not sent again — the answer is `WrongPassword` without asking — until the
/// student saves a new one; a refusal now marks it so.
#[cfg_attr(not(debug_assertions), allow(dead_code))] // Only the debug command calls it until Phase 3.
pub(crate) async fn sign_in_stored(
    app: &tauri::AppHandle,
    base_url: &str,
    client_id: &str,
) -> Result<bool, SignInError> {
    let realm = sign_on_for(base_url).ok_or_else(|| {
        SignInError::Local("Uni Pilot does not know where this ILIAS signs students in.".into())
    })?;
    let credentials = vault::stored_sign_in(base_url)
        .await
        .map_err(from_vault)?
        .ok_or(SignInError::NotSetUp)?;
    if credentials.stale {
        eprintln!("ILIAS sign-in: not tried; HHN refused the stored password before.");
        return Err(SignInError::WrongPassword);
    }
    let result = sign_in_with(app, base_url, client_id, realm, &credentials).await;
    if result == Err(SignInError::WrongPassword) {
        if let Err(error) = vault::mark_stale(base_url).await {
            eprintln!("ILIAS sign-in: the refused password could not be marked: {error:?}");
        }
    }
    result
}

fn sign_on_for(base_url: &str) -> Option<&'static str> {
    let host = Url::parse(base_url).ok()?.host_str()?.to_ascii_lowercase();
    SIGN_ONS
        .iter()
        .find(|(ilias, _)| *ilias == host)
        .map(|(_, realm)| *realm)
}

fn from_vault(error: VaultError) -> SignInError {
    SignInError::Local(match error {
        VaultError::Refused => "You declined Uni Pilot's access to the stored sign-in.".into(),
        VaultError::Invalid(message) | VaultError::Unavailable(message) => message,
    })
}

/// Signs in to the sign-on at `realm` — the installation's own, e.g.
/// `https://login.hs-heilbronn.de/realms/hhn` — with the student's values,
/// hands the result to the webview and lets ILIAS sign in through it.
/// `Ok(true)` when ILIAS has a session again.
async fn sign_in_with(
    app: &tauri::AppHandle,
    base_url: &str,
    client_id: &str,
    realm: &str,
    credentials: &Credentials,
) -> Result<bool, SignInError> {
    let home = resolve_target(base_url, client_id, None).map_err(SignInError::Local)?;
    let entry = home
        .join("openidconnect.php")
        .map_err(|error| SignInError::Local(error.to_string()))?;
    let realm = Url::parse(realm)
        .map_err(|_| SignInError::Local("The sign-on's address is not one.".into()))?;
    let hosts = keycloak::Hosts::new(entry, realm)?;
    let jar = keycloak::sign_in(&hosts, credentials).await?;
    handoff::hand_off(app, &jar, hosts.sign_on(), base_url, client_id).await
}

#[cfg(test)]
mod tests {
    use super::{sign_on_for, SignInError};

    /// The shape the page reads in `iliasSync.ts`, like `SyncError`'s.
    #[test]
    fn tells_the_page_what_went_wrong_by_kind() {
        assert_eq!(
            serde_json::to_value(SignInError::WrongCode).unwrap(),
            serde_json::json!({ "kind": "wrongCode" })
        );
        assert_eq!(
            serde_json::to_value(SignInError::NotSetUp).unwrap(),
            serde_json::json!({ "kind": "notSetUp" })
        );
        assert_eq!(
            serde_json::to_value(SignInError::Unrecognised("A page.".into())).unwrap(),
            serde_json::json!({ "kind": "unrecognised", "message": "A page." })
        );
    }

    /// The page names the ILIAS; Rust alone knows where its sign-on is.
    #[test]
    fn knows_the_sign_on_by_the_ilias_host_alone() {
        for hhn in [
            "https://ilias.hs-heilbronn.de",
            "https://ILIAS.hs-heilbronn.de/",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI",
        ] {
            assert_eq!(
                sign_on_for(hhn),
                Some("https://login.hs-heilbronn.de/realms/hhn"),
                "{hhn}"
            );
        }
        for other in [
            "https://ilias.example.edu",
            "https://ilias.hs-heilbronn.de.evil.example",
            "https://evil.example/ilias.hs-heilbronn.de",
            "not an address",
        ] {
            assert_eq!(sign_on_for(other), None, "{other}");
        }
    }
}
