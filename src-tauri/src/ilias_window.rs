//! The in-app ILIAS window.
//!
//! At Heilbronn only one of ILIAS's four integration channels is open — the
//! calendar feed. Courses, materials, submissions, forums and tests are reachable
//! through no interface at all, so Uni Pilot opens ILIAS itself, in a window of
//! its own, and lets students do there what the app cannot do for them.
//!
//! Three facts decided the shape of this module:
//!
//! - ILIAS sends `x-frame-options: SAMEORIGIN`, so it cannot be framed inside
//!   the app's own page. A separate window is a top-level document, which the
//!   header does not touch.
//! - `core:webview:allow-create-webview-window` carries no URL scope: granting
//!   it would let the frontend open any page at all. Creating the window here
//!   needs no capability, and puts the check on what may be opened in the one
//!   place that cannot be bypassed from JavaScript.
//! - A window showing a remote page gets no IPC unless a capability says so
//!   (`capabilities/default.json` names only `main`). The ILIAS window cannot
//!   call into the app, and nothing here changes that.
//!
//! **Never inject script into this window.** No `initialization_script`, no
//! `eval`, nothing that reads the page or fills in a form. Students type their
//! university password into it. It is a browser, and only a browser.

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "ilias";

/// Opens ILIAS, or brings the existing ILIAS window forward at the new target.
///
/// `async` on purpose: creating a window from a synchronous command can
/// deadlock on Windows.
#[tauri::command]
pub async fn open_ilias(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    target: Option<String>,
) -> Result<(), String> {
    let url = resolve_target(&base_url, &client_id, target.as_deref())?;

    // One ILIAS window, reused: a second would mean a second sign-in state to
    // reason about, and a student with three copies of the same dashboard.
    if let Some(window) = app.get_webview_window(LABEL) {
        window
            .navigate(url)
            .map_err(|error| format!("ILIAS could not be opened: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("ILIAS could not be brought forward: {error}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("ILIAS")
        .inner_size(1180.0, 860.0)
        .min_inner_size(820.0, 600.0)
        // Without it, downloads are silently cancelled.
        .on_download(crate::ilias_browser::on_download)
        .build()
        .map(|window| crate::ilias_browser::prepare(window.as_ref()))
        .map_err(|error| format!("ILIAS could not be opened: {error}"))
}

/// Decides what the window may open, and turns it into a full address.
///
/// Mirrors `resolveIliasTarget` in
/// `src/features/integrations/lib/ilias/endpoints.ts`, which does the same for
/// the browser tab. The tests below use the same cases as the TypeScript ones;
/// change both or neither.
pub(crate) fn resolve_target(
    base_url: &str,
    client_id: &str,
    target: Option<&str>,
) -> Result<Url, String> {
    let base = parse_base(base_url)?;
    if !is_client_id(client_id) {
        return Err("That ILIAS client name contains characters it should not.".into());
    }

    let wanted = target.map(str::trim).unwrap_or("");

    // Not the root: at Heilbronn it redirects to the public repository, signed
    // out. The dashboard is the student's own page when signed in, and ILIAS
    // sends them through its login first when not.
    if wanted.is_empty() {
        return Ok(with_query(
            &base,
            "ilias.php",
            &[("baseClass", "ilDashboardGUI"), ("client_id", client_id)],
        ));
    }

    if is_goto_shorthand(wanted) {
        return Ok(with_query(
            &base,
            "goto.php",
            &[("target", wanted), ("client_id", client_id)],
        ));
    }

    // Deep links come out of calendar feeds, which is to say from outside. Only
    // the configured installation's origin is accepted; this also rules out
    // javascript:, data: and file:, none of which can share an https origin.
    let mut url =
        Url::parse(wanted).map_err(|_| "That is not an address ILIAS can open.".to_string())?;
    if url.scheme() != "https" || url.origin() != base.origin() {
        return Err("That link does not belong to your ILIAS, so it will not open here.".into());
    }

    let named = url
        .query_pairs()
        .find(|(key, _)| key == "client_id")
        .map(|(_, value)| value.into_owned());
    match named {
        None => {
            url.query_pairs_mut().append_pair("client_id", client_id);
        }
        Some(ref existing) if existing.as_str() == client_id => {}
        Some(_) => return Err("That link points to a different ILIAS client.".into()),
    }
    Ok(url)
}

fn parse_base(base_url: &str) -> Result<Url, String> {
    let url = Url::parse(base_url.trim())
        .map_err(|_| "The ILIAS address is not a web address.".to_string())?;
    if url.scheme() != "https" {
        return Err("ILIAS has to be reached over https.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("The ILIAS address must not carry a username or password.".into());
    }
    if url.host_str().is_none() {
        return Err("The ILIAS address has no host.".into());
    }
    Ok(url)
}

/// Client ids end up in a query string; nothing else belongs in one.
fn is_client_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
}

/// `crs_717`, `exc_4711` — the shorthand `goto.php` understands.
fn is_goto_shorthand(value: &str) -> bool {
    match value.split_once('_') {
        Some((kind, id)) => {
            !kind.is_empty()
                && kind.bytes().all(|byte| byte.is_ascii_lowercase())
                && !id.is_empty()
                && id.bytes().all(|byte| byte.is_ascii_digit())
        }
        None => false,
    }
}

/// A page of the installation, keeping any subdirectory it lives in.
fn with_query(base: &Url, page: &str, pairs: &[(&str, &str)]) -> Url {
    let mut url = base.clone();
    url.set_path(&format!("{}/{}", base.path().trim_end_matches('/'), page));
    url.set_query(None);
    url.set_fragment(None);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(key, value);
        }
    }
    url
}

/// The same cases as `describe('resolveIliasTarget')` in
/// `src/features/integrations/lib/ilias/endpoints.test.ts`.
#[cfg(test)]
mod tests {
    use super::resolve_target;

    const BASE: &str = "https://ilias.hs-heilbronn.de";
    const CLIENT: &str = "iliashhn";

    fn open(target: Option<&str>) -> Result<String, String> {
        resolve_target(BASE, CLIENT, target).map(|url| url.to_string())
    }

    #[test]
    fn opens_the_dashboard_when_there_is_no_target() {
        let dashboard =
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn";
        assert_eq!(open(None).unwrap(), dashboard);
        assert_eq!(open(Some("   ")).unwrap(), dashboard);
    }

    #[test]
    fn turns_a_goto_shorthand_into_a_deep_link() {
        assert_eq!(
            open(Some("crs_717")).unwrap(),
            "https://ilias.hs-heilbronn.de/goto.php?target=crs_717&client_id=iliashhn"
        );
    }

    #[test]
    fn accepts_a_link_from_the_same_installation_and_adds_the_client() {
        assert_eq!(
            open(Some("https://ilias.hs-heilbronn.de/goto.php?target=exc_42")).unwrap(),
            "https://ilias.hs-heilbronn.de/goto.php?target=exc_42&client_id=iliashhn"
        );
    }

    #[test]
    fn keeps_a_link_that_already_names_the_right_client() {
        let link = "https://ilias.hs-heilbronn.de/goto.php?target=exc_42&client_id=iliashhn";
        assert_eq!(open(Some(link)).unwrap(), link);
    }

    #[test]
    fn refuses_a_link_that_names_a_different_client() {
        let error = open(Some(
            "https://ilias.hs-heilbronn.de/goto.php?client_id=other",
        ))
        .unwrap_err();
        assert!(error.contains("different ILIAS client"), "{error}");
    }

    /// Deep links arrive inside calendar feeds. A feed must not be able to open
    /// an arbitrary page in the window a student is about to sign in through.
    #[test]
    fn refuses_anything_outside_the_installation() {
        for target in [
            "https://evil.example/login",
            "https://ilias.hs-heilbronn.de.evil.example/",
            "http://ilias.hs-heilbronn.de/goto.php?target=crs_1",
            "https://ilias.hs-heilbronn.de:8443/",
            "javascript:alert(1)",
            "data:text/html,hello",
            "file:///etc/passwd",
        ] {
            assert!(
                open(Some(target)).is_err(),
                "{target} should have been refused"
            );
        }
    }

    #[test]
    fn refuses_an_installation_that_is_not_on_https() {
        let error = resolve_target("http://ilias.hs-heilbronn.de", CLIENT, None).unwrap_err();
        assert!(error.contains("https"), "{error}");
    }

    #[test]
    fn refuses_an_installation_address_that_carries_credentials() {
        let error = resolve_target("https://user:pw@ilias.example", CLIENT, None).unwrap_err();
        assert!(error.contains("username or password"), "{error}");
    }

    #[test]
    fn refuses_a_client_id_that_would_break_out_of_the_query() {
        let error = resolve_target(BASE, "hhn&baseClass=x", None).unwrap_err();
        assert!(error.contains("client name"), "{error}");
    }

    #[test]
    fn keeps_a_subdirectory_installation_in_the_path() {
        assert_eq!(
            resolve_target("https://example.edu/ilias", "c", Some("crs_5"))
                .unwrap()
                .to_string(),
            "https://example.edu/ilias/goto.php?target=crs_5&client_id=c"
        );
    }
}
