//! Asking ILIAS for a page with the student's own session, one page at a time.
//!
//! The session cookie is read from the webview store the student signed in
//! with, for each request, and sent only to ILIAS's origin; nothing is kept.
//! The ILIAS view has no data directory of its own, so it shares the default
//! store with Uni Pilot's own page, and the session should be readable through
//! either — the ILIAS view need not be open. That is the assumption the first
//! run on each platform confirms.
//!
//! Politeness (`docs/integrations/ilias-sync-research.md` §6.3): one request
//! at a time, a pause of two to three seconds between them, a User-Agent that
//! says who is asking, and no retry on `429` or `5xx` — the caller tries
//! again later, not now.
//!
//! `file_response` asks for a file: one the student clicked, or one the course
//! sync keeps in the student's Documents (`../mirror/`). Either counts as
//! reading the file in ILIAS, exactly as a click there would, which is why the
//! course sync runs only for courses the student switched on. A click skips
//! the queue — the student is waiting — while the course sync waits its turn
//! (`Pace::turn`). Files have their own, narrower check for where they may
//! come from (`links::may_download`).

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{Manager, Runtime, Url};
use tauri_plugin_http::reqwest::{self, header, redirect};
use tokio::sync::{Mutex, MutexGuard};

use super::links::{may_download, may_fetch};
use super::session::{signed_in, wants_sign_in};
use super::SyncError;
use crate::ilias_links::{file_name_from_disposition, is_page};
use crate::ilias_view::{ILIAS, MAIN};

const PAUSE: Duration = Duration::from_secs(2);
const JITTER_MS: u32 = 1000;
const TIMEOUT: Duration = Duration::from_secs(30);
/// Lecture recordings run to hundreds of megabytes.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// Enough for goto.php to land on the page; fewer than a loop.
const REDIRECT_LIMIT: usize = 5;
const USER_AGENT: &str = concat!(
    "UniPilot/",
    env!("CARGO_PKG_VERSION"),
    " (ILIAS sync; +https://github.com/rbatmaz69/Uni-Pilot)"
);

/// The one sync request allowed in flight, and when the last one ended.
#[derive(Default)]
pub struct Pace(Mutex<Option<Instant>>);

impl Pace {
    /// Waits for the sync's turn: the request before done, and the pause
    /// after it over. Set the guard to `Some(Instant::now())` once the request
    /// has ended, so the next one pauses from then.
    pub async fn turn(&self) -> MutexGuard<'_, Option<Instant>> {
        let last = self.0.lock().await;
        if let Some(ended) = *last {
            let due = ended + PAUSE + jitter();
            let now = Instant::now();
            if due > now {
                tokio::time::sleep(due - now).await;
            }
        }
        last
    }
}

pub async fn fetch<R: Runtime>(
    app: &tauri::AppHandle<R>,
    pace: &Pace,
    url: Url,
) -> Result<String, SyncError> {
    // The address the sync built fixes what counts as ILIAS for its redirects.
    let home = url.clone();
    if !may_fetch(&url, &home) {
        return Err(SyncError::Refused(format!(
            "The sync does not ask ILIAS for {url}."
        )));
    }

    let cookie = session_cookie(app, &url)?;

    let mut last = pace.turn().await;
    let result = page(&url, &home, cookie).await;
    *last = Some(Instant::now());
    result
}

async fn page(url: &Url, home: &Url, cookie: String) -> Result<String, SyncError> {
    let response = send(url, home, cookie, may_fetch, TIMEOUT).await?;
    let landed = response.url().clone();
    let html = response
        .text()
        .await
        .map_err(|error| SyncError::Unreachable(format!("ILIAS could not be read: {error}")))?;
    if !signed_in(&landed, &html) {
        eprintln!(
            "ILIAS sync: signed out: {} came back without ILIAS's sign-out link.",
            landed.path()
        );
        return Err(SyncError::SignedOut);
    }
    Ok(html)
}

/// Asks ILIAS for the file at `url` and checks a file came back, not a page.
/// Returns the response to read the file from, and the name ILIAS suggested.
pub async fn file_response<R: Runtime>(
    app: &tauri::AppHandle<R>,
    url: &Url,
) -> Result<(reqwest::Response, Option<String>), SyncError> {
    let home = url.clone();
    if !may_download(url, &home) {
        return Err(SyncError::Refused(format!(
            "Uni Pilot does not download {url}."
        )));
    }
    let cookie = session_cookie(app, url)?;
    let response = send(url, &home, cookie, may_download, DOWNLOAD_TIMEOUT).await?;

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
        // A page where a file was asked for: the sign-in, or ILIAS refusing.
        let landed = response.url().clone();
        let html = response.text().await.unwrap_or_default();
        return Err(if signed_in(&landed, &html) {
            SyncError::Unrecognised(
                "ILIAS showed a page instead of the file. Open it in ILIAS to see why.".into(),
            )
        } else {
            SyncError::SignedOut
        });
    }
    let suggested = disposition.as_deref().and_then(file_name_from_disposition);
    Ok((response, suggested))
}

/// The student's ILIAS cookies as a `Cookie` header, read afresh.
fn session_cookie<R: Runtime>(app: &tauri::AppHandle<R>, url: &Url) -> Result<String, SyncError> {
    let (view, through) = match app.get_webview(ILIAS) {
        Some(view) => (view, "the ILIAS view"),
        None => (
            app.get_webview(MAIN).ok_or_else(|| {
                SyncError::Unreachable(
                    "Uni Pilot has no window to read the ILIAS sign-in from.".into(),
                )
            })?,
            "Uni Pilot's page",
        ),
    };
    let cookies = view.cookies_for_url(url.clone()).map_err(|error| {
        SyncError::Unreachable(format!("The ILIAS sign-in could not be read: {error}"))
    })?;
    // Why a request came back signed out is said in the terminal; in a
    // development build, with the cookie names it went with. Names only: a
    // value is a sign-in.
    #[cfg(debug_assertions)]
    eprintln!(
        "ILIAS sync: {} through {through}, cookies: [{}]",
        url.path(),
        cookies
            .iter()
            .map(|cookie| cookie.name())
            .collect::<Vec<_>>()
            .join(", ")
    );
    if cookies.is_empty() {
        eprintln!("ILIAS sync: signed out: no ILIAS cookie through {through}.");
        return Err(SyncError::SignedOut);
    }
    Ok(cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; "))
}

/// Sends the request and turns every answer but a success into its error.
/// Redirects are followed only where `allow` says.
async fn send(
    url: &Url,
    home: &Url,
    cookie: String,
    allow: fn(&Url, &Url) -> bool,
    timeout: Duration,
) -> Result<reqwest::Response, SyncError> {
    let allowed = home.clone();
    let client = reqwest::Client::builder()
        .redirect(redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= REDIRECT_LIMIT || !allow(attempt.url(), &allowed) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .connect_timeout(TIMEOUT)
        .timeout(timeout)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| SyncError::Unreachable(format!("ILIAS could not be asked: {error}")))?;
    let response = client
        .get(url.clone())
        .header(header::COOKIE, cookie)
        .send()
        .await
        .map_err(|error| SyncError::Unreachable(format!("ILIAS could not be reached: {error}")))?;

    let status = response.status();
    if status.is_redirection() {
        // A redirect the policy did not follow: to the sign-in, or somewhere
        // the sync never goes.
        let location = response
            .headers()
            .get(header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| response.url().join(value).ok());
        return Err(match location {
            Some(location) if wants_sign_in(&location, home) => {
                eprintln!(
                    "ILIAS sync: signed out: ILIAS sent the request on to {}{}.",
                    location.host_str().unwrap_or_default(),
                    location.path()
                );
                SyncError::SignedOut
            }
            Some(location) => SyncError::Refused(format!(
                "ILIAS sent the sync on to {location}, where it does not go."
            )),
            None => SyncError::Unrecognised("ILIAS redirected without saying where.".into()),
        });
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        return Err(SyncError::Unreachable(format!(
            "ILIAS is busy ({status}). Try again later."
        )));
    }
    if !status.is_success() {
        return Err(SyncError::Unreachable(format!("ILIAS answered {status}.")));
    }
    Ok(response)
}

/// Up to a second on top of the pause, so a schedule never hits ILIAS on the beat.
fn jitter() -> Duration {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.subsec_nanos())
        .unwrap_or(0);
    Duration::from_millis(u64::from(nanos % JITTER_MS))
}

#[cfg(test)]
mod tests {
    use super::{send, TIMEOUT};
    use crate::ilias_sync::links::may_fetch;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use tauri::Url;

    /// ILIAS's logs name Uni Pilot: a request from the sync says who is asking,
    /// so the university can count it, reach us, or turn it away.
    #[test]
    fn names_itself_in_every_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            let read = stream.read(&mut request).unwrap();
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .unwrap();
            String::from_utf8_lossy(&request[..read]).into_owned()
        });

        let url = Url::parse(&format!("http://127.0.0.1:{port}/ilias.php")).unwrap();
        let answer = tauri::async_runtime::block_on(send(
            &url,
            &url,
            "PHPSESSID=test".into(),
            may_fetch,
            TIMEOUT,
        ));
        assert!(answer.is_ok());

        let request = server.join().unwrap();
        let agent = request
            .lines()
            .find(|line| line.to_ascii_lowercase().starts_with("user-agent:"))
            .expect("a User-Agent header");
        println!("ILIAS would see: {agent}");
        assert!(agent.contains("UniPilot/"), "{agent}");
        assert!(
            agent.contains("+https://github.com/rbatmaz69/Uni-Pilot"),
            "{agent}"
        );
    }
}
