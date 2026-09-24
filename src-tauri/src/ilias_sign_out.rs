//! Signing out of ILIAS from the strip.
//!
//! ILIAS 9 signs out only through the link in its own user menu: `doLogout`
//! is one of ilStartUpGUI's "unsafe GET commands", which ILIAS runs only with
//! the `rtoken` that link carries. A bare `logout.php` — what the strip used to
//! open — is dropped without a word and ILIAS sends the student straight back
//! to the dashboard: a flicker, and still signed in.
//!
//! So Uni Pilot asks ILIAS for the dashboard once, as the ILIAS webview would,
//! finds that link in it and opens it in the webview. ILIAS then ends the
//! session on its side, exactly as the menu would.
//!
//! That alone leaves the university's single sign-on signed in, and the next
//! "sign in" would pass straight through without a password. So afterwards
//! the webview also forgets every cookie that is not ILIAS's own — the sign-on
//! service's among them. Uni Pilot's own page keeps no cookies; nothing of it
//! is touched.
//!
//! Nothing is injected into the page and nothing is kept: the dashboard is
//! read for that one link and dropped.

use std::time::Duration;

use serde::Serialize;
use tauri::{Manager, Runtime, Url};

use crate::ilias_links::fetch_as_ilias;
use crate::ilias_view::ILIAS;
use crate::ilias_window::resolve_target;

/// Long enough for ILIAS to finish signing out — and to sign out of the
/// sign-on service too, where it is set up to — before its cookies go.
const SIGN_ON_GRACE: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SignedOut {
    /// ILIAS ended the session itself.
    Ilias,
    /// ILIAS offered no sign-out link — most likely nobody was signed in — so
    /// only this computer forgot the sign-in.
    Here,
}

/// ILIAS's own sign-out link in a page, with its token. `None` when the page
/// has none, which is what a signed-out page looks like.
fn find_sign_out_link(html: &str, page: &Url) -> Option<Url> {
    let mut rest = html;
    while let Some(at) = rest.find("logout.php") {
        let before = &rest[..at];
        let after = &rest[at..];
        rest = &rest[at + "logout.php".len()..];

        let Some(open) = before.rfind(['"', '\'']) else {
            continue;
        };
        let quote = before[open..].chars().next().unwrap_or('"');
        let Some(close) = after.find(quote) else {
            continue;
        };
        let raw = format!("{}{}", &before[open + 1..], &after[..close]);
        let href = raw.replace("&amp;", "&").replace("\\/", "/");
        if !href.contains("cmd=doLogout") || !href.contains("rtoken=") {
            continue;
        }
        if let Ok(link) = page.join(&href) {
            if link.origin() == page.origin() {
                return Some(link);
            }
        }
    }
    None
}

/// Whether a cookie set for `domain` is sent to `host`.
fn cookie_reaches(domain: &str, host: &str) -> bool {
    let domain = domain.trim_start_matches('.').to_ascii_lowercase();
    let host = host.to_ascii_lowercase();
    host == domain || host.ends_with(&format!(".{domain}"))
}

/// Forgets the web cookies this computer holds: all of them but ILIAS's own,
/// or with `ilias_too`, ILIAS's as well. Uni Pilot's own page is left alone.
fn forget_cookies<R: Runtime>(view: &tauri::Webview<R>, ilias_host: &str, ilias_too: bool) {
    let Ok(cookies) = view.cookies() else {
        return;
    };
    for cookie in cookies {
        let Some(domain) = cookie.domain().map(str::to_owned) else {
            continue;
        };
        let local = ["localhost", "tauri.localhost"]
            .iter()
            .any(|own| cookie_reaches(&domain, own));
        if local || (!ilias_too && cookie_reaches(&domain, ilias_host)) {
            continue;
        }
        if let Err(error) = view.delete_cookie(cookie) {
            eprintln!("ILIAS sign-out: a cookie could not be removed: {error}");
        }
    }
}

/// Signs out of ILIAS the way its own menu does, then makes this computer
/// forget the university sign-on.
#[tauri::command]
pub async fn sign_out_of_ilias(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
) -> Result<SignedOut, String> {
    let home = resolve_target(&base_url, &client_id, None)?;
    let host = home.host_str().unwrap_or_default().to_string();
    let view = app
        .get_webview(ILIAS)
        .ok_or_else(|| "ILIAS is not open.".to_string())?;

    let response = fetch_as_ilias(&view, &home).await?;
    let page = response.url().clone();
    let html = response
        .text()
        .await
        .map_err(|error| format!("ILIAS could not be read: {error}"))?;

    match find_sign_out_link(&html, &page) {
        Some(link) => {
            view.navigate(link)
                .map_err(|error| format!("ILIAS could not sign you out: {error}"))?;
            tauri::async_runtime::spawn(async move {
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    std::thread::sleep(SIGN_ON_GRACE);
                    forget_cookies(&view, &host, false);
                })
                .await;
            });
            Ok(SignedOut::Ilias)
        }
        None => {
            forget_cookies(&view, &host, true);
            view.navigate(home)
                .map_err(|error| format!("ILIAS could not be opened: {error}"))?;
            Ok(SignedOut::Here)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{cookie_reaches, find_sign_out_link};
    use tauri::Url;

    fn dashboard() -> Url {
        Url::parse("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI").unwrap()
    }

    /// The link from ILIAS 9's user menu, HTML-escaped as ILIAS writes it.
    #[test]
    fn finds_the_link_from_the_user_menu() {
        let html = r#"<li><a class="il-link link-bulky" href="logout.php?lang=de&amp;cmdClass=ilstartupgui&amp;cmdNode=ab:cd&amp;baseClass=ilStartUpGUI&amp;cmd=doLogout&amp;rtoken=0123abcd"><span class="bulky-label">Abmelden</span></a></li>"#;
        let link = find_sign_out_link(html, &dashboard()).unwrap();
        assert_eq!(
            link.as_str(),
            "https://ilias.hs-heilbronn.de/logout.php?lang=de&cmdClass=ilstartupgui&cmdNode=ab:cd&baseClass=ilStartUpGUI&cmd=doLogout&rtoken=0123abcd"
        );
    }

    #[test]
    fn finds_an_absolute_link_too() {
        let html = "<a href='https://ilias.hs-heilbronn.de/logout.php?cmd=doLogout&rtoken=x'>";
        assert!(find_sign_out_link(html, &dashboard()).is_some());
    }

    /// The bare link is exactly what ILIAS ignores; it must not be chosen.
    #[test]
    fn skips_a_link_without_its_token() {
        let html = r#"<a href="logout.php?client_id=iliashhn">Abmelden</a>"#;
        assert_eq!(find_sign_out_link(html, &dashboard()), None);
    }

    #[test]
    fn skips_a_link_to_another_site() {
        let html = r#"<a href="https://evil.example/logout.php?cmd=doLogout&rtoken=x">"#;
        assert_eq!(find_sign_out_link(html, &dashboard()), None);
    }

    #[test]
    fn finds_nothing_on_a_signed_out_page() {
        let html = r#"<a href="login.php?cmd=force_login&amp;client_id=iliashhn">Anmelden</a>"#;
        assert_eq!(find_sign_out_link(html, &dashboard()), None);
    }

    #[test]
    fn tells_whose_cookie_it_is() {
        assert!(cookie_reaches(
            "ilias.hs-heilbronn.de",
            "ilias.hs-heilbronn.de"
        ));
        assert!(cookie_reaches(".hs-heilbronn.de", "ilias.hs-heilbronn.de"));
        assert!(!cookie_reaches(
            "login.hs-heilbronn.de",
            "ilias.hs-heilbronn.de"
        ));
        assert!(!cookie_reaches("heilbronn.de", "evilheilbronn.de"));
    }
}
