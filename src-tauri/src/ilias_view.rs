//! ILIAS mode: ILIAS filling the Uni Pilot window under a strip of our own.
//!
//! On the ILIAS page the window holds two webviews side by side — never on top
//! of each other:
//!
//! ```text
//! ┌──────────────────────────────────────────────┐
//! │ (title bar, macOS, windowed only)            │
//! ├──────────────────────────────────────────────┤  ← titlebar
//! │ Uni Pilot: the strip — back, home, sign out  │  main webview
//! ├──────────────────────────────────────────────┤  ← titlebar + strip
//! │                                              │
//! │ ILIAS                                        │  ILIAS webview
//! │                                              │
//! └──────────────────────────────────────────────┘
//! ```
//!
//! An earlier version laid ILIAS *over* the page instead. That fought over the
//! mouse: macOS sends pointer movement to every webview under the pointer, so
//! the covered page and ILIAS kept resetting the cursor over each other and it
//! flickered between the hand and the arrow. Webviews that do not overlap have
//! nothing to fight over. The price is that the main webview shrinks to the
//! strip, so this module — not the page, which can no longer see the window —
//! lays out both, and again on every resize.
//!
//! It is not an `<iframe>`: ILIAS forbids those (`x-frame-options:
//! SAMEORIGIN`). It is a second webview attached with `Window::add_child`,
//! behind Tauri's `unstable` feature, which Tauri describes as unfinished; the
//! separate window in `ilias_window.rs` stays available as the fallback.
//!
//! Everything that makes the separate window safe holds here too: created in
//! Rust, only for addresses `resolve_target` accepts, no IPC for the remote page
//! (`capabilities/default.json` names only the main window), and **never any
//! script injected into it**. Students type their university password there;
//! it is a browser and nothing else.

use std::sync::Mutex;

use tauri::webview::WebviewBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl};

use crate::ilias_browser;
use crate::ilias_window::resolve_target;

pub(crate) const ILIAS: &str = "ilias-view";
const MAIN: &str = "main";

/// The strip is a bar, not a page. Anything outside this range means the page
/// measured something other than the strip.
const STRIP_RANGE: std::ops::RangeInclusive<f64> = 24.0..=160.0;

/// What macOS draws over the top of the window when it is not full screen.
/// Measured on entry whenever possible; this is only for when it cannot be —
/// entering ILIAS mode already in full screen, where the bar is hidden.
#[cfg(target_os = "macos")]
const TITLEBAR_FALLBACK: f64 = 28.0;
#[cfg(not(target_os = "macos"))]
const TITLEBAR_FALLBACK: f64 = 0.0;

/// No title bar is taller than this. A larger gap between the window and the
/// page means the page was measured while already shrunk — after a reload in
/// ILIAS mode, say — and the number is not a title bar at all.
const TITLEBAR_MAX: f64 = 80.0;

/// Held only to read or write the numbers, never across a webview call:
/// resizes arrive on the main thread, and webview calls from a command wait
/// for the main thread. Holding it across one would deadlock the two.
#[derive(Default)]
pub struct Mode(Mutex<Option<Layout>>);

/// Creating the ILIAS webview is check-then-act, and React mounts effects twice
/// in development. Only `enter_ilias_mode` takes this, never the resize path,
/// so waiting on the main thread while holding it cannot deadlock.
static CREATING: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq)]
struct Layout {
    /// Height of the strip, in logical pixels.
    strip: f64,
    /// Height of the macOS title bar when the window is not full screen.
    titlebar_windowed: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Where the strip and ILIAS go in a window of this size. Pure, so it can be
/// tested without a window.
fn arrange(width: f64, height: f64, titlebar: f64, strip: f64) -> (Rect, Rect) {
    let strip_rect = Rect {
        x: 0.0,
        y: titlebar,
        width,
        height: strip,
    };
    let top = titlebar + strip;
    let ilias_rect = Rect {
        x: 0.0,
        y: top,
        width,
        height: (height - top).max(0.0),
    };
    (strip_rect, ilias_rect)
}

/// The gap between the window and the page is what the title bar covers.
///
/// On macOS the window's content runs up under the title bar and WebKit keeps
/// the page clear of it, so a page's y is the window's y minus this. It is 0 in
/// full screen and on Windows and Linux, where nothing covers the page.
fn titlebar_offset(window_height: f64, page_height: f64) -> f64 {
    let gap = window_height - page_height;
    if !gap.is_finite() || gap < 0.0 {
        0.0
    } else if gap > TITLEBAR_MAX {
        TITLEBAR_FALLBACK
    } else {
        gap
    }
}

fn logical_size<R: Runtime>(window: &tauri::Window<R>) -> Result<(f64, f64), String> {
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let size = window
        .inner_size()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale);
    Ok((size.width, size.height))
}

fn place<R: Runtime>(view: &tauri::Webview<R>, rect: Rect) -> Result<(), String> {
    view.set_position(LogicalPosition::new(rect.x, rect.y))
        .and_then(|()| view.set_size(LogicalSize::new(rect.width, rect.height)))
        .map_err(|error| format!("ILIAS could not be placed: {error}"))
}

/// Lays out the strip and ILIAS for the window as it is now.
fn apply<R: Runtime>(app: &tauri::AppHandle<R>, layout: Layout) -> Result<(), String> {
    let window = app
        .get_window(MAIN)
        .ok_or_else(|| "The Uni Pilot window is gone.".to_string())?;
    let (width, height) = logical_size(&window)?;
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let titlebar = if fullscreen {
        0.0
    } else {
        layout.titlebar_windowed
    };
    let (strip_rect, ilias_rect) = arrange(width, height, titlebar, layout.strip);

    if let Some(main) = app.get_webview(MAIN) {
        main.set_auto_resize(false)
            .map_err(|error| format!("Uni Pilot could not make room for ILIAS: {error}"))?;
        place(&main, strip_rect)?;
    }
    if let Some(view) = app.get_webview(ILIAS) {
        place(&view, ilias_rect)?;
        view.show()
            .map_err(|error| format!("ILIAS could not be shown: {error}"))?;
    }
    Ok(())
}

/// Gives the main webview the whole window back.
fn restore<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(view) = app.get_webview(ILIAS) {
        view.hide()
            .map_err(|error| format!("ILIAS could not be hidden: {error}"))?;
    }
    let window = app
        .get_window(MAIN)
        .ok_or_else(|| "The Uni Pilot window is gone.".to_string())?;
    let (width, height) = logical_size(&window)?;
    if let Some(main) = app.get_webview(MAIN) {
        place(
            &main,
            Rect {
                x: 0.0,
                y: 0.0,
                width,
                height,
            },
        )?;
        main.set_auto_resize(true)
            .map_err(|error| format!("Uni Pilot could not take the window back: {error}"))?;
    }
    Ok(())
}

fn current<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<Layout> {
    app.state::<Mode>().0.lock().ok().and_then(|layout| *layout)
}

fn remember<R: Runtime>(app: &tauri::AppHandle<R>, layout: Option<Layout>) {
    if let Ok(mut slot) = app.state::<Mode>().0.lock() {
        *slot = layout;
    }
}

/// Switches the window to ILIAS mode, creating the ILIAS webview the first time.
///
/// `strip` is the strip's height and `page_height` the page's height before
/// anything shrinks, both as the page measured them; together with the window
/// they give the title bar. `target: None` keeps the page ILIAS was on; a
/// string navigates, `""` meaning the dashboard.
#[tauri::command]
pub async fn enter_ilias_mode(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    target: Option<String>,
    strip: f64,
    page_height: f64,
) -> Result<(), String> {
    if !strip.is_finite() || !STRIP_RANGE.contains(&strip) {
        return Err("ILIAS could not be opened: the page reported an impossible bar.".into());
    }
    // Resolved even when not navigating, so a bad configuration fails here
    // rather than leaving the window laid out around nothing.
    let url = resolve_target(&base_url, &client_id, target.as_deref())?;

    let window = app
        .get_window(MAIN)
        .ok_or_else(|| "ILIAS could not be opened: the Uni Pilot window is gone.".to_string())?;

    // Measured only on the way in. Already in ILIAS mode — after a reload, say —
    // the page is the strip, and its height says nothing about the title bar.
    let layout = match current(&app) {
        Some(known) => Layout { strip, ..known },
        None => {
            let (_, window_height) = logical_size(&window)?;
            let fullscreen = window.is_fullscreen().unwrap_or(false);
            Layout {
                strip,
                titlebar_windowed: if fullscreen {
                    TITLEBAR_FALLBACK
                } else {
                    titlebar_offset(window_height, page_height)
                },
            }
        }
    };
    remember(&app, Some(layout));

    {
        let _creating = CREATING.lock().map_err(|_| {
            "ILIAS could not be opened: a previous attempt failed midway.".to_string()
        })?;
        match app.get_webview(ILIAS) {
            Some(view) => {
                if target.is_some() {
                    view.navigate(url)
                        .map_err(|error| format!("ILIAS could not be opened: {error}"))?;
                }
            }
            None => {
                // Created at zero size; `apply` below puts it where it belongs.
                let view = window
                    .add_child(
                        WebviewBuilder::new(ILIAS, WebviewUrl::External(url))
                            .on_download(ilias_browser::on_download)
                            .on_page_load(ilias_browser::on_page_load),
                        LogicalPosition::new(0.0, 0.0),
                        LogicalSize::new(0.0, 0.0),
                    )
                    .map_err(|error| format!("ILIAS could not be opened: {error}"))?;
                ilias_browser::prepare(&view);
            }
        }
    }

    apply(&app, layout)
}

/// Leaves ILIAS mode: ILIAS is hidden, not closed, so coming back finds it on
/// the page the student left; Uni Pilot gets the whole window back.
#[tauri::command]
pub async fn leave_ilias_mode(app: tauri::AppHandle) -> Result<(), String> {
    if current(&app).is_none() {
        return Ok(());
    }
    remember(&app, None);
    restore(&app)
}

/// Sends ILIAS somewhere without leaving ILIAS mode — the dashboard, sign-out,
/// a deep link that arrives while the page is already open.
#[tauri::command]
pub async fn navigate_ilias(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    target: String,
) -> Result<(), String> {
    let url = resolve_target(&base_url, &client_id, Some(&target))?;
    match app.get_webview(ILIAS) {
        Some(view) => view
            .navigate(url)
            .map_err(|error| format!("ILIAS could not be opened: {error}")),
        None => Err("ILIAS is not open.".into()),
    }
}

/// Removes ILIAS entirely, for disconnecting. The sign-in lives in the
/// webview's cookies, which outlast it; signing out is ILIAS's job.
#[tauri::command]
pub async fn close_ilias_view(app: tauri::AppHandle) -> Result<(), String> {
    remember(&app, None);
    restore(&app)?;
    match app.get_webview(ILIAS) {
        Some(view) => view
            .close()
            .map_err(|error| format!("ILIAS could not be closed: {error}")),
        None => Ok(()),
    }
}

/// Keeps the layout right as the window changes — resized, taken to full
/// screen and back. Called from `lib.rs` for the main window.
pub fn relayout<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(layout) = current(app) {
        if let Err(error) = apply(app, layout) {
            // Nowhere to show it from here; the next resize or visit tries again.
            eprintln!("ILIAS layout: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{arrange, titlebar_offset, Rect, TITLEBAR_FALLBACK};

    #[test]
    fn puts_the_strip_under_the_title_bar_and_ilias_under_the_strip() {
        let (strip, ilias) = arrange(1440.0, 900.0, 28.0, 48.0);
        assert_eq!(
            strip,
            Rect {
                x: 0.0,
                y: 28.0,
                width: 1440.0,
                height: 48.0
            }
        );
        assert_eq!(
            ilias,
            Rect {
                x: 0.0,
                y: 76.0,
                width: 1440.0,
                height: 824.0
            }
        );
    }

    /// The two never overlap — overlapping is what made the cursor flicker.
    #[test]
    fn leaves_no_overlap_between_strip_and_ilias() {
        let (strip, ilias) = arrange(1200.0, 800.0, 28.0, 48.0);
        assert_eq!(strip.y + strip.height, ilias.y);
    }

    /// Full width: ILIAS is not confined to a reading column.
    #[test]
    fn gives_ilias_the_whole_width() {
        let (_, ilias) = arrange(2560.0, 1440.0, 0.0, 48.0);
        assert_eq!(ilias.x, 0.0);
        assert_eq!(ilias.width, 2560.0);
    }

    #[test]
    fn never_gives_ilias_a_negative_height() {
        let (_, ilias) = arrange(800.0, 40.0, 28.0, 48.0);
        assert_eq!(ilias.height, 0.0);
    }

    /// The bug that hid the bar: windowed on macOS the page starts 28pt below
    /// the window's origin. In full screen there is no title bar to clear.
    #[test]
    fn reads_the_title_bar_from_the_gap_between_window_and_page() {
        assert_eq!(titlebar_offset(900.0, 872.0), 28.0);
        assert_eq!(titlebar_offset(1117.0, 1117.0), 0.0);
    }

    #[test]
    fn never_reports_a_negative_title_bar() {
        assert_eq!(titlebar_offset(800.0, 820.0), 0.0);
        assert_eq!(titlebar_offset(f64::NAN, 800.0), 0.0);
    }

    /// Measured while the page is already the strip, the gap is the whole
    /// window. That is not a title bar, so the known height is used instead.
    #[test]
    fn distrusts_a_gap_no_title_bar_could_be() {
        assert_eq!(titlebar_offset(900.0, 48.0), TITLEBAR_FALLBACK);
    }
}
