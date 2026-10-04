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
use crate::vault::Credentials;

/// Why signing in automatically did not work. The page decides what to offer
/// from the kind, as for `SyncError`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum SignInError {
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

/// Signs in to the sign-on at `realm` — the installation's own, e.g.
/// `https://login.hs-heilbronn.de/realms/hhn` — with the student's values,
/// hands the result to the webview and lets ILIAS sign in through it.
/// `Ok(true)` when ILIAS has a session again.
#[allow(dead_code)] // The "Sign in automatically" button calls it (Phase 3).
pub(crate) async fn sign_in_to_ilias(
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
    use super::SignInError;

    /// The shape the page will read, like `SyncError`'s.
    #[test]
    fn tells_the_page_what_went_wrong_by_kind() {
        assert_eq!(
            serde_json::to_value(SignInError::WrongCode).unwrap(),
            serde_json::json!({ "kind": "wrongCode" })
        );
        assert_eq!(
            serde_json::to_value(SignInError::Unrecognised("A page.".into())).unwrap(),
            serde_json::json!({ "kind": "unrecognised", "message": "A page." })
        );
    }
}
