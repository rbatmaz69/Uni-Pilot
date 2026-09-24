//! Links ILIAS opens in a new window, and ILIAS in the student's own browser.
//!
//! **New windows.** ILIAS opens every file it delivers inline — PDFs above all —
//! with `target="_blank"` (ILIAS 9, `ilObjFileListGUI::getCommandFrame`). A
//! webview has no tabs, and without a handler it silently refuses new windows:
//! clicking a PDF in ILIAS did nothing at all. Here each such link goes where a
//! browser's new tab would have taken it:
//!
//! - **ILIAS itself** (same origin): Uni Pilot asks for it once, with the ILIAS
//!   webview's own cookies. A file is saved to Downloads like any other
//!   download, with the strip showing it; a page opens in the ILIAS view.
//! - **Anywhere else** (`http`, `https`, `mailto`): the default browser or mail
//!   app, as a new tab would have been.
//! - **Anything else**: refused.
//!
//! The ILIAS session cookie is read for that one request and nothing else: sent
//! only to ILIAS's own origin, redirects followed only within it, never stored,
//! never handed to the page. No script touches the ILIAS page for any of this.
//!
//! **Your browser.** Passkeys — Touch ID or the Mac's password at the
//! university sign-in — work in Safari but not in an app's webview: Apple keeps
//! them for browsers and for an app's own domains. `open_ilias_in_browser`
//! opens the page ILIAS is on in the default browser instead.

use std::io::Write;
use std::path::Path;

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{Manager, Runtime, Url};
use tauri_plugin_http::reqwest::{self, header, redirect};

use crate::ilias_browser::{begin_download, end_download, is_attachment, open_with_system};
use crate::ilias_view::ILIAS;
use crate::ilias_window::resolve_target;

/// More than any sign-in or file delivery needs; fewer than a redirect loop.
const REDIRECT_LIMIT: usize = 10;

#[derive(Debug, PartialEq)]
enum Destination {
    /// ILIAS's own origin: fetched, then saved or shown in place.
    Ilias,
    /// Somewhere else a browser tab or mail app can handle.
    Outside,
    Refused,
}

fn classify(home: &Url, link: &Url) -> Destination {
    if link.origin() == home.origin() {
        Destination::Ilias
    } else if matches!(link.scheme(), "https" | "http" | "mailto") {
        Destination::Outside
    } else {
        Destination::Refused
    }
}

/// Whether a response is a page to show rather than a file to save. Anything
/// but a plain success is shown too, so ILIAS can say what went wrong itself.
fn is_page(status: u16, content_type: Option<&str>, disposition: Option<&str>) -> bool {
    if !(200..300).contains(&status) {
        return true;
    }
    if disposition.is_some_and(is_attachment) {
        return false;
    }
    match content_type {
        None => true,
        Some(value) => {
            let mime = value.split(';').next().unwrap_or_default().trim();
            mime.eq_ignore_ascii_case("text/html")
                || mime.eq_ignore_ascii_case("application/xhtml+xml")
        }
    }
}

/// Decodes `%XX` escapes; anything malformed is kept as it is.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |b: u8| (b as char).to_digit(16);
        match (bytes[i], bytes.get(i + 1), bytes.get(i + 2)) {
            (b'%', Some(&high), Some(&low)) if hex(high).is_some() && hex(low).is_some() => {
                out.push((hex(high).unwrap_or(0) * 16 + hex(low).unwrap_or(0)) as u8);
                i += 3;
            }
            (byte, _, _) => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The file name in a `Content-Disposition` header. `filename*` (RFC 6266,
/// UTF-8, percent-encoded) wins over plain `filename`, as in browsers.
fn file_name_from_disposition(value: &str) -> Option<String> {
    let mut plain = None;
    for part in value.split(';').skip(1) {
        let Some((key, raw)) = part.split_once('=') else {
            continue;
        };
        let raw = raw.trim();
        match key.trim().to_ascii_lowercase().as_str() {
            "filename*" => {
                // charset'language'encoded — the name is after the second quote.
                let encoded = raw.rsplit('\'').next().unwrap_or(raw).trim_matches('"');
                let name = percent_decode(encoded);
                if !name.is_empty() {
                    return Some(name);
                }
            }
            "filename" => {
                let name = raw.trim_matches('"').replace("\\\"", "\"");
                if !name.is_empty() {
                    plain = Some(name);
                }
            }
            _ => {}
        }
    }
    plain
}

/// The last path segment, for a file that came without a name.
fn file_name_from_url(url: &Url) -> String {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .map(percent_decode)
        .unwrap_or_default()
}

/// Fetches an ILIAS link the way the ILIAS webview would, then saves a file or
/// shows a page.
async fn fetch_or_show<R: Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    link: Url,
) -> Result<(), String> {
    let view = app.get_webview(label).ok_or("ILIAS is not open.")?;
    let cookie = view
        .cookies_for_url(link.clone())
        .map_err(|error| format!("ILIAS could not be asked: {error}"))?
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");

    let origin = link.origin();
    let client = reqwest::Client::builder()
        .redirect(redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= REDIRECT_LIMIT || attempt.url().origin() != origin {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|error| format!("ILIAS could not be asked: {error}"))?;
    let mut response = client
        .get(link.clone())
        .header(header::COOKIE, cookie)
        .send()
        .await
        .map_err(|error| format!("ILIAS could not be reached: {error}"))?;

    let text = |name: header::HeaderName| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let content_type = text(header::CONTENT_TYPE);
    let disposition = text(header::CONTENT_DISPOSITION);

    if is_page(
        response.status().as_u16(),
        content_type.as_deref(),
        disposition.as_deref(),
    ) {
        drop(response);
        return view
            .navigate(link)
            .map_err(|error| format!("ILIAS could not be opened: {error}"));
    }

    let suggested = disposition
        .as_deref()
        .and_then(file_name_from_disposition)
        .unwrap_or_else(|| file_name_from_url(response.url()));
    let key = link.as_str();
    let path = begin_download(app, key, &suggested).ok_or("There is no Downloads folder.")?;
    let saved = save(&mut response, &path).await;
    if saved.is_err() {
        // A half-written file would look like the real thing.
        let _ = std::fs::remove_file(&path);
    }
    end_download(app, key, saved.is_ok());
    saved
}

async fn save(response: &mut reqwest::Response, path: &Path) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|error| error.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        file.write_all(&chunk).map_err(|error| error.to_string())?;
    }
    file.flush().map_err(|error| error.to_string())
}

/// The new-window hook for an ILIAS webview. `home` is where it was opened,
/// which fixes what counts as ILIAS. The webview never opens a window itself.
pub fn on_new_window<R: Runtime>(
    app: tauri::AppHandle<R>,
    label: &'static str,
    home: Url,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |link, _features| {
        match classify(&home, &link) {
            Destination::Ilias => {
                // From a task: this runs inside a webview callback on the main
                // thread, and reading cookies waits for the main thread.
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = fetch_or_show(&app, label, link).await {
                        eprintln!("ILIAS link: {error}");
                    }
                });
            }
            Destination::Outside => {
                if let Err(error) = open_with_system(link.as_str()) {
                    eprintln!("ILIAS link: {error}");
                }
            }
            Destination::Refused => {}
        }
        NewWindowResponse::Deny
    }
}

/// Opens the page ILIAS is on in the default browser — for passkeys, which an
/// app's webview cannot offer. Anywhere but ILIAS itself (the sign-in page,
/// whose address is tied to this webview's session) opens the dashboard.
#[tauri::command]
pub async fn open_ilias_in_browser(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
) -> Result<(), String> {
    let home = resolve_target(&base_url, &client_id, None)?;
    let here = app
        .get_webview(ILIAS)
        .and_then(|view| view.url().ok())
        .filter(|url| url.origin() == home.origin());
    open_with_system(here.unwrap_or(home).as_str())
}

#[cfg(test)]
mod tests {
    use super::{
        classify, file_name_from_disposition, file_name_from_url, is_page, percent_decode,
        Destination,
    };
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn keeps_ilias_links_in_uni_pilot() {
        let home = url("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI");
        let file = url("https://ilias.hs-heilbronn.de/goto.php?target=file_42_download");
        assert_eq!(classify(&home, &file), Destination::Ilias);
    }

    #[test]
    fn sends_other_sites_to_the_browser() {
        let home = url("https://ilias.hs-heilbronn.de/");
        assert_eq!(
            classify(&home, &url("https://www.hs-heilbronn.de/")),
            Destination::Outside
        );
        assert_eq!(
            classify(&home, &url("mailto:someone@example.org")),
            Destination::Outside
        );
    }

    /// Same host, different scheme or port, is a different origin: the session
    /// cookie must never travel there.
    #[test]
    fn treats_another_port_or_scheme_as_outside() {
        let home = url("https://ilias.hs-heilbronn.de/");
        assert_eq!(
            classify(&home, &url("http://ilias.hs-heilbronn.de/")),
            Destination::Outside
        );
        assert_eq!(
            classify(&home, &url("https://ilias.hs-heilbronn.de:8443/")),
            Destination::Outside
        );
    }

    #[test]
    fn refuses_what_neither_can_handle() {
        let home = url("https://ilias.hs-heilbronn.de/");
        assert_eq!(
            classify(&home, &url("file:///etc/passwd")),
            Destination::Refused
        );
        assert_eq!(
            classify(&home, &url("javascript:alert(1)")),
            Destination::Refused
        );
    }

    /// The case that did nothing before: ILIAS delivering a PDF inline.
    #[test]
    fn saves_an_inline_pdf() {
        assert!(!is_page(
            200,
            Some("application/pdf"),
            Some("inline; filename=\"a.pdf\"")
        ));
    }

    #[test]
    fn saves_an_attachment_even_as_html() {
        assert!(!is_page(
            200,
            Some("text/html"),
            Some("attachment; filename=\"a.html\"")
        ));
    }

    #[test]
    fn shows_pages_and_errors_in_place() {
        assert!(is_page(200, Some("text/html; charset=UTF-8"), None));
        assert!(is_page(200, None, None));
        assert!(is_page(302, Some("application/pdf"), None));
        assert!(is_page(403, Some("application/pdf"), None));
    }

    #[test]
    fn reads_a_plain_file_name() {
        assert_eq!(
            file_name_from_disposition("inline; filename=\"Blatt 3.pdf\"").as_deref(),
            Some("Blatt 3.pdf")
        );
        assert_eq!(
            file_name_from_disposition("attachment; filename=notes.txt").as_deref(),
            Some("notes.txt")
        );
    }

    /// Umlauts come percent-encoded in `filename*`, which wins.
    #[test]
    fn prefers_the_encoded_file_name() {
        let value = "inline; filename=\"Ubung.pdf\"; filename*=UTF-8''%C3%9Cbung%201.pdf";
        assert_eq!(
            file_name_from_disposition(value).as_deref(),
            Some("Übung 1.pdf")
        );
    }

    #[test]
    fn has_no_name_without_a_file_name() {
        assert_eq!(file_name_from_disposition("inline"), None);
    }

    #[test]
    fn falls_back_to_the_address() {
        assert_eq!(
            file_name_from_url(&url("https://x.example/data/Skript%20WS.pdf?x=1")),
            "Skript WS.pdf"
        );
    }

    #[test]
    fn keeps_a_malformed_escape_as_it_is() {
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("a%zzb"), "a%zzb");
    }
}
