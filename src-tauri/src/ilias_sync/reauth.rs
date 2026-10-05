//! A new ILIAS session without the student — while the university's sign-on
//! still remembers them.
//!
//! ILIAS ends its session after an idle while; a laptop asleep over a break is
//! enough. The sign-on (Keycloak at HHN) keeps a session of its own, set when
//! the student signed in with password and code, and for as long as that one
//! lasts, ILIAS's OIDC entry passes straight through it: `openidconnect.php`
//! → Keycloak → back to ILIAS with a new session, no form in between. A
//! browser tab does exactly that when you open ILIAS again. Here it happens
//! in a hidden window sharing the ILIAS view's cookie store.
//!
//! The window is never shown, nothing is typed into it, and no script runs in
//! it. If the sign-on wants the password and code again, it lands on its form;
//! the window is closed there, and the student signs in themselves, in ILIAS
//! mode. How long the sign-on remembers anyone is the university's decision.

use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

use super::SyncError;
use crate::ilias_window::resolve_target;

const LABEL: &str = "ilias-sign-on";
/// Long enough for two redirects over a slow network; short enough that a
/// page waiting on the sync does not notice much.
const TIMEOUT: Duration = Duration::from_secs(20);

/// Where a page load left the hidden window.
#[derive(Debug, PartialEq)]
enum Outcome {
    /// Back on ILIAS, past its OIDC entry: a new session.
    SignedIn,
    /// On a sign-in form — ILIAS's or the university's.
    NeedsSignIn,
    /// Still on the way.
    Pending,
}

fn outcome(landed: &Url, home: &Url) -> Outcome {
    if landed.origin() != home.origin() {
        // The sign-on answered with a page of its own: its form.
        return Outcome::NeedsSignIn;
    }
    let page = landed.path().rsplit('/').next().unwrap_or_default();
    let forced = landed
        .query_pairs()
        .any(|(key, value)| key == "cmd" && value == "force_login");
    match page {
        "openidconnect.php" => Outcome::Pending,
        "login.php" => Outcome::NeedsSignIn,
        _ if forced => Outcome::NeedsSignIn,
        _ => Outcome::SignedIn,
    }
}

/// Tries for a new ILIAS session through the sign-on. `true` when there is
/// one; `false` when the student has to sign in.
#[tauri::command]
pub async fn ilias_sync_reauth(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
) -> Result<bool, SyncError> {
    let home = resolve_target(&base_url, &client_id, None).map_err(SyncError::Refused)?;
    let entry = home
        .join("openidconnect.php")
        .map_err(|error| SyncError::Refused(error.to_string()))?;

    // One attempt at a time; a leftover from one that failed goes first.
    if let Some(stale) = app.get_webview_window(LABEL) {
        let _ = stale.destroy();
    }

    let (sender, mut landed) = tokio::sync::mpsc::unbounded_channel::<Url>();
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(entry))
        .title("ILIAS")
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = sender.send(payload.url().clone());
            }
        })
        .build()
        .map_err(|error| SyncError::Unreachable(format!("ILIAS could not be asked: {error}")))?;

    let result = tokio::time::timeout(TIMEOUT, async {
        while let Some(url) = landed.recv().await {
            match outcome(&url, &home) {
                Outcome::Pending => continue,
                Outcome::SignedIn => return true,
                Outcome::NeedsSignIn => return false,
            }
        }
        false
    })
    .await
    .unwrap_or(false);

    let _ = window.destroy();
    eprintln!(
        "ILIAS sync: signing on again {}.",
        if result {
            "worked"
        } else {
            "needs the student"
        }
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{outcome, Outcome};
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    fn home() -> Url {
        url("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn")
    }

    #[test]
    fn counts_a_return_to_ilias_as_a_new_session() {
        for landed in [
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&cmd=jumpToSelectedItems",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ildashboardgui&cmd=show",
        ] {
            assert_eq!(outcome(&url(landed), &home()), Outcome::SignedIn, "{landed}");
        }
    }

    #[test]
    fn stops_at_any_sign_in_form() {
        for landed in [
            "https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth?client_id=hhn_common_ilias",
            "https://ilias.hs-heilbronn.de/login.php?cmd=force_login",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilStartUpGUI&cmd=force_login",
        ] {
            assert_eq!(outcome(&url(landed), &home()), Outcome::NeedsSignIn, "{landed}");
        }
    }

    #[test]
    fn waits_while_still_on_the_way() {
        let landed = url("https://ilias.hs-heilbronn.de/openidconnect.php?code=abc&state=xyz");
        assert_eq!(outcome(&landed, &home()), Outcome::Pending);
    }
}
