//! ILIAS embedded in the Uni Pilot window.
//!
//! The separate window in `ilias_window.rs` works, but a student switching
//! between two windows does not feel like one app. So ILIAS also appears
//! *inside* the main window: a second native webview laid over the content area
//! of the ILIAS page, next to the sidebar.
//!
//! It is not an `<iframe>` — ILIAS forbids those with
//! `x-frame-options: SAMEORIGIN` — but a webview of its own, attached to the
//! window with `Window::add_child`. That call sits behind Tauri's `unstable`
//! feature, which Tauri marks as unfinished; the separate window stays
//! available as the fallback.
//!
//! Everything that makes the separate window safe holds here too:
//!
//! - It is created in Rust, and only for an address `resolve_target` accepts.
//! - A webview showing a remote page gets no IPC; `capabilities/default.json`
//!   names only the main window.
//! - **Never inject script into it.** No initialisation script, no `eval`,
//!   nothing that reads the page. Students type their university password into
//!   it; it is a browser and nothing else.
//!
//! The webview is a native layer *on top of* the React page, not part of it, so
//! the page tells Rust where it should sit (`Bounds`, measured from a
//! placeholder element) and when to step aside for a dialog.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::webview::WebviewBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

use crate::ilias_window::resolve_target;

const LABEL: &str = "ilias-view";
const HOST_WINDOW: &str = "main";

/// Creation is check-then-act — "is there a view? if not, add one" — and React
/// mounts effects twice in development, so two calls can race. Holding this
/// while checking and adding keeps it to one view.
static CREATING: Mutex<()> = Mutex::new(());

/// Where the view sits, in logical pixels relative to the window's content —
/// the same numbers `getBoundingClientRect` gives the page.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Bounds {
    /// The page measures these; a NaN or a negative size means it measured
    /// something that is not on screen, and placing a webview there helps no one.
    fn checked(self) -> Result<Self, String> {
        let values = [self.x, self.y, self.width, self.height];
        if values.iter().any(|value| !value.is_finite()) || self.width < 0.0 || self.height < 0.0 {
            return Err("ILIAS could not be placed: the page reported an impossible size.".into());
        }
        Ok(self)
    }

    fn position(self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
    }

    fn size(self) -> LogicalSize<f64> {
        LogicalSize::new(self.width, self.height)
    }
}

/// Shows ILIAS in the main window, creating the view the first time.
///
/// `target: None` keeps whatever page the student was on — leaving the ILIAS
/// page and coming back should not throw them back to the dashboard. A target,
/// including an empty one for "the dashboard", navigates.
#[tauri::command]
pub async fn show_ilias_view(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    target: Option<String>,
    bounds: Bounds,
) -> Result<(), String> {
    let bounds = bounds.checked()?;
    // Resolved even when not navigating, so a bad configuration fails here
    // rather than leaving a view pointed at nothing.
    let url = resolve_target(&base_url, &client_id, target.as_deref())?;

    let _creating = CREATING
        .lock()
        .map_err(|_| "ILIAS could not be opened: a previous attempt failed midway.".to_string())?;

    if let Some(view) = app.get_webview(LABEL) {
        if target.is_some() {
            view.navigate(url).map_err(|error| format!("ILIAS could not be opened: {error}"))?;
        }
        place(&view, bounds)?;
        return view.show().map_err(|error| format!("ILIAS could not be shown: {error}"));
    }

    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "ILIAS could not be opened: the Uni Pilot window is gone.".to_string())?;
    window
        .add_child(
            WebviewBuilder::new(LABEL, WebviewUrl::External(url)),
            bounds.position(),
            bounds.size(),
        )
        .map(|_| ())
        .map_err(|error| format!("ILIAS could not be opened: {error}"))
}

/// Moves and resizes the view to follow the page. Does nothing when there is
/// no view yet — the next `show_ilias_view` brings its own bounds.
#[tauri::command]
pub async fn place_ilias_view(app: tauri::AppHandle, bounds: Bounds) -> Result<(), String> {
    let bounds = bounds.checked()?;
    match app.get_webview(LABEL) {
        Some(view) => place(&view, bounds),
        None => Ok(()),
    }
}

/// Steps the view aside — while a dialog is open, or when the student leaves
/// the ILIAS page. Hidden, not closed: the page and the sign-in stay as they were.
#[tauri::command]
pub async fn hide_ilias_view(app: tauri::AppHandle) -> Result<(), String> {
    match app.get_webview(LABEL) {
        Some(view) => view.hide().map_err(|error| format!("ILIAS could not be hidden: {error}")),
        None => Ok(()),
    }
}

/// Removes the view entirely, for disconnecting. The sign-in lives in the
/// webview's cookies, which outlast the view; signing out is ILIAS's job.
#[tauri::command]
pub async fn close_ilias_view(app: tauri::AppHandle) -> Result<(), String> {
    match app.get_webview(LABEL) {
        Some(view) => view.close().map_err(|error| format!("ILIAS could not be closed: {error}")),
        None => Ok(()),
    }
}

fn place<R: tauri::Runtime>(view: &tauri::Webview<R>, bounds: Bounds) -> Result<(), String> {
    view.set_position(bounds.position())
        .and_then(|()| view.set_size(bounds.size()))
        .map_err(|error| format!("ILIAS could not be placed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::Bounds;

    fn bounds(x: f64, y: f64, width: f64, height: f64) -> Bounds {
        Bounds { x, y, width, height }
    }

    #[test]
    fn accepts_what_a_laid_out_page_reports() {
        assert!(bounds(248.0, 132.0, 1100.0, 700.0).checked().is_ok());
    }

    /// Before layout, or while collapsed, an element can measure zero. That is
    /// a real state, not an error — the view is simply not visible yet.
    #[test]
    fn accepts_an_empty_area() {
        assert!(bounds(0.0, 0.0, 0.0, 0.0).checked().is_ok());
    }

    #[test]
    fn refuses_a_negative_size() {
        assert!(bounds(0.0, 0.0, -1.0, 400.0).checked().is_err());
        assert!(bounds(0.0, 0.0, 400.0, -1.0).checked().is_err());
    }

    #[test]
    fn refuses_numbers_that_are_not_numbers() {
        assert!(bounds(f64::NAN, 0.0, 10.0, 10.0).checked().is_err());
        assert!(bounds(0.0, 0.0, f64::INFINITY, 10.0).checked().is_err());
    }
}
