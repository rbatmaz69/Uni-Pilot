//! Reading the student's ILIAS without opening it.
//!
//! At HHN ILIAS has no interface for courses, files or exercises that a
//! student's app may use: SOAP is closed, there is no REST API, and the news
//! feed carries no files (`docs/integrations/ilias-integration-research.md`).
//! What remains is the page ILIAS shows the student. The student signs in
//! themselves, in ILIAS mode; Rust asks for pages with that session and reads
//! them. No password passes through Uni Pilot, no script touches the ILIAS
//! page, and the HTML stays here: the webview only receives what the readers
//! made of it. Background and design: `docs/integrations/ilias-sync-research.md`.
//!
//! - `links`: the pages the sync may ask for, and the check every request
//!   passes. ILIAS pages hold account actions as plain links; none is followed.
//! - `fetch`: one request at a time, with the student's session.
//! - `session`: a signed-out answer is told apart from an empty one.
//! - `parse`: the readers, tested against recorded HHN pages in `fixtures/`.
//! - `dates`: ILIAS's "Heute, 10:12" into a date.
//! - `reauth`: a new ILIAS session through the sign-on, while it still
//!   remembers the student — no password, no code, no form.
//! - `mirror`: a course's files kept in the student's Documents, in the
//!   course's `ILIAS` folder.
//!
//! Reading pages marks nothing as read in ILIAS: files are described from the
//! lists they appear in. A file is downloaded only when the student clicks for
//! it, or for a course whose files the student asked Uni Pilot to keep
//! (`mirror`) — either of which ILIAS counts as reading, as it would a click
//! in ILIAS itself.

mod dates;
mod fetch;
mod links;
pub mod mirror;
mod parse;
pub mod reauth;
mod session;

use serde::Serialize;
use tauri::State;

pub use fetch::Pace;
use links::{ref_id, Container, Page};
use parse::{Assignment, ContentItem, Course};

/// Why a sync request gave nothing. The page decides what to offer from the
/// kind: "Sign in to ILIAS again" for `signedOut`, "Try again later" for
/// `unreachable`, a bug report for `unrecognised`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum SyncError {
    /// ILIAS wants a sign-in first.
    SignedOut,
    /// Asked for something the sync never asks for.
    Refused(String),
    /// ILIAS could not be reached, or answered with an error.
    Unreachable(String),
    /// ILIAS answered with a page the readers do not know: a new release, most likely.
    Unrecognised(String),
    /// Uni Pilot could not do its part on this computer: a course folder that
    /// could not be written, a sync already running.
    Local(String),
}

/// Collapses runs of whitespace — ILIAS's `&nbsp;&nbsp;` padding among them.
pub(crate) fn squash(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

/// The student's courses and groups, online or not.
#[tauri::command]
pub async fn ilias_sync_courses(
    app: tauri::AppHandle,
    pace: State<'_, Pace>,
    base_url: String,
    client_id: String,
) -> Result<Vec<Course>, SyncError> {
    let url = Page::Memberships
        .url(&base_url, &client_id)
        .map_err(SyncError::Refused)?;
    let html = fetch::fetch(&app, &pace, url).await?;
    parse::read_memberships(&html, today()).map_err(SyncError::Unrecognised)
}

/// What a course, group or folder holds: folders, files with their version
/// and date, exercises, links.
#[tauri::command]
pub async fn ilias_sync_contents(
    app: tauri::AppHandle,
    pace: State<'_, Pace>,
    base_url: String,
    client_id: String,
    container: Container,
    container_ref_id: String,
) -> Result<Vec<ContentItem>, SyncError> {
    let id = ref_id(&container_ref_id).map_err(SyncError::Refused)?;
    let url = Page::Contents(container, id)
        .url(&base_url, &client_id)
        .map_err(SyncError::Refused)?;
    let html = fetch::fetch(&app, &pace, url).await?;
    parse::read_contents(&html, today()).map_err(SyncError::Unrecognised)
}

/// An exercise's assignments, past ones included: deadline, whether the
/// student handed something in, and the grade.
#[tauri::command]
pub async fn ilias_sync_assignments(
    app: tauri::AppHandle,
    pace: State<'_, Pace>,
    base_url: String,
    client_id: String,
    exercise_ref_id: String,
) -> Result<Vec<Assignment>, SyncError> {
    let id = ref_id(&exercise_ref_id).map_err(SyncError::Refused)?;
    let url = Page::Assignments(id)
        .url(&base_url, &client_id)
        .map_err(SyncError::Refused)?;
    let html = fetch::fetch(&app, &pace, url).await?;
    parse::read_assignments(&html, &exercise_ref_id, today()).map_err(SyncError::Unrecognised)
}

#[cfg(test)]
mod tests {
    use super::{squash, SyncError};

    #[test]
    fn squashes_ilias_padding() {
        assert_eq!(squash("\n\t\tbackup\u{a0}\u{a0}"), "backup");
        assert_eq!(squash("  Version:   3 "), "Version: 3");
    }

    /// The shape the page reads; `iliasSync.ts` depends on it.
    #[test]
    fn tells_the_page_what_went_wrong_by_kind() {
        assert_eq!(
            serde_json::to_value(SyncError::SignedOut).unwrap(),
            serde_json::json!({ "kind": "signedOut" })
        );
        assert_eq!(
            serde_json::to_value(SyncError::Unreachable("ILIAS answered 404.".into())).unwrap(),
            serde_json::json!({ "kind": "unreachable", "message": "ILIAS answered 404." })
        );
    }
}
