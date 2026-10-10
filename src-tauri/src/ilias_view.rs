//! ILIAS mode: ILIAS as the card of the Uni Pilot window, beside a column of
//! our own.
//!
//! On the ILIAS page the window holds two webviews side by side — never on top
//! of each other:
//!
//! ```text
//! ┌──────┬──────────────┬─────────────────────────────┐
//! │ rail │ ILIAS panel  │                             │ ← title bar (macOS,
//! │      │ ‹ › ⌂        │  ILIAS, as the card         │   windowed only) and
//! │      │ courses…     │  (rounded on the right,     │   the frame's gutter
//! │      │ footer: …    │   gutter top/right/bottom)  │
//! └──────┴──────────────┴─────────────────────────────┘
//!    main webview = the        ILIAS's webview
//!    left column, full height
//! ```
//!
//! The left column is Uni Pilot itself: the icon rail and the ILIAS panel,
//! which carries the controls the strip used to (back, forward, dashboard,
//! courses, downloads, sign out). The page tells Rust how wide that column is
//! and how wide the frame's gutter is; Rust does the rest.
//!
//! An earlier version laid ILIAS *over* the page instead. That fought over the
//! mouse: macOS sends pointer movement to every webview under the pointer, so
//! the covered page and ILIAS kept resetting the cursor over each other and it
//! flickered between the hand and the arrow. Webviews that do not overlap have
//! nothing to fight over. The price is that the main webview shrinks to the
//! column, so this module — not the page, which can no longer see the window —
//! lays out both, and again on every resize.
//!
//! **The gutter is the window's own colour.** Where no webview covers the
//! window — above, right of and below ILIAS — the window background shows. The
//! page passes the frame's colour with each layout and Rust sets it as the
//! window background (`Window::set_background_color`), so the gutter matches
//! the frame in every theme; the page sends it again when the theme changes.
//! Leaving ILIAS mode puts the default background back. On macOS ILIAS's right
//! corners are rounded through its layer, like the card's.
//!
//! **Linux is different.** There Tauri packs every webview of a window into a
//! vertical GTK box and ignores the positions and sizes set on them. The box
//! shares its height by what each child would *like* — and a WebKit view would
//! like the height of its page. On Linux `stack` therefore moves both webviews
//! into a horizontal `GtkPaned`, whose divider stays where it is put: at the
//! column's width, ILIAS to its right. A paned also gives the whole of itself
//! to the one child still visible, so hiding ILIAS is all leaving takes. The
//! box sits below the title bar by itself, so the title bar plays no part
//! there, and there are no gutters.
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

use std::ops::RangeInclusive;
use std::sync::Mutex;

use tauri::webview::WebviewBuilder;
use tauri::window::Color;
use tauri::{LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl};

use crate::ilias_browser;
use crate::ilias_links;
use crate::ilias_window::resolve_target;

pub(crate) const ILIAS: &str = "ilias-view";
pub(crate) const MAIN: &str = "main";

/// What the page may report for the left column (the rail and the panel), in
/// logical pixels. Anything outside means the page measured something else —
/// a panel that was not laid out yet, say.
const COLUMN_RANGE: RangeInclusive<f64> = 96.0..=640.0;

/// What the page may report for the frame's gutter, the space around the card.
const GUTTER_RANGE: RangeInclusive<f64> = 0.0..=32.0;

/// The card's corner radius on the right, as `--radius-md` in `globals.css`.
/// Only used where a gutter leaves the corners visible.
const CARD_RADIUS: f64 = 10.0;

/// What macOS draws over the top of the window when it is not full screen.
/// Measured on entry whenever possible; this is only for when it cannot be —
/// entering ILIAS mode already in full screen, where the bar is hidden.
#[cfg(target_os = "macos")]
const TITLEBAR_FALLBACK: f64 = 28.0;
#[cfg(not(target_os = "macos"))]
const TITLEBAR_FALLBACK: f64 = 0.0;

/// No title bar is taller than this. A larger gap between the window and the
/// page means the page was not measured at the window's height — after a
/// reload in ILIAS mode, say — and the number is not a title bar at all.
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
    /// Width of the left column — rail and panel — in logical pixels.
    column: f64,
    /// The frame's gutter around the card, in logical pixels.
    gutter: f64,
    /// The frame's colour, for the window behind the gutter. `None` leaves the
    /// window's background as it is.
    frame: Option<[u8; 3]>,
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

/// Where the left column and ILIAS go in a window of this size. Pure, so it can
/// be tested without a window.
///
/// The column runs the full height of the window. Under a macOS title bar the
/// page keeps itself clear of the bar on its own, as it does on every page; ILIAS
/// does not, so it starts below the bar and the gutter. It ends a gutter short
/// of the right and bottom edges, and joins the column on its left. The column
/// is clamped to what is sane and to the window, so ILIAS is never negative
/// and never under the column.
fn arrange(width: f64, height: f64, titlebar: f64, column: f64, gutter: f64) -> (Rect, Rect) {
    let column = column
        .clamp(*COLUMN_RANGE.start(), *COLUMN_RANGE.end())
        .min(width.max(0.0));
    let gutter = gutter.clamp(*GUTTER_RANGE.start(), *GUTTER_RANGE.end());
    let column_rect = Rect {
        x: 0.0,
        y: 0.0,
        width: column,
        height,
    };
    let top = titlebar + gutter;
    let ilias_rect = Rect {
        x: column,
        y: top,
        width: (width - column - gutter).max(0.0),
        height: (height - top - gutter).max(0.0),
    };
    (column_rect, ilias_rect)
}

/// What the page reports must be a number that could be a layout.
fn check_metrics(column: f64, gutter: f64) -> Result<(), String> {
    if column.is_finite()
        && COLUMN_RANGE.contains(&column)
        && gutter.is_finite()
        && GUTTER_RANGE.contains(&gutter)
    {
        Ok(())
    } else {
        Err("ILIAS could not be opened: the page reported an impossible layout.".into())
    }
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

/// Lays out the column and ILIAS for the window as it is now.
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
    let (column_rect, ilias_rect) = arrange(width, height, titlebar, layout.column, layout.gutter);

    if let Some(main) = app.get_webview(MAIN) {
        main.set_auto_resize(false)
            .map_err(|error| format!("Uni Pilot could not make room for ILIAS: {error}"))?;
        place(&main, column_rect)?;
        #[cfg(target_os = "linux")]
        stack(&main, column_rect.width)?;
    }
    if let Some(view) = app.get_webview(ILIAS) {
        place(&view, ilias_rect)?;
        view.show()
            .map_err(|error| format!("ILIAS could not be shown: {error}"))?;
    }
    Ok(())
}

/// What follows the layout rather than the window's size: the window behind
/// the gutter, and ILIAS's corners. Not on every resize, only when the page
/// says something new. Failing here costs looks, not function, so it is only
/// reported.
fn style<R: Runtime>(app: &tauri::AppHandle<R>, layout: Layout) {
    if let (Some(window), Some([red, green, blue])) = (app.get_window(MAIN), layout.frame) {
        if let Err(error) = window.set_background_color(Some(Color(red, green, blue, 255))) {
            eprintln!("ILIAS frame colour: {error}");
        }
    }
    if let Some(view) = app.get_webview(ILIAS) {
        round_card(
            &view,
            if layout.gutter > 0.0 {
                CARD_RADIUS
            } else {
                0.0
            },
        );
    }
}

/// macOS: rounds ILIAS's right-hand corners, which stand free in the gutter;
/// the left edge joins the panel and stays square. Through the view's layer,
/// not through the page, so ILIAS is not touched.
///
/// "Right" is `kCALayerMaxXMinYCorner | kCALayerMaxXMaxYCorner`: both corners
/// on the far side of x, whichever way the layer's y runs.
#[cfg(target_os = "macos")]
fn round_card<R: Runtime>(view: &tauri::Webview<R>, radius: f64) {
    use objc2::msg_send;
    use objc2::runtime::{AnyObject, Bool};

    /// `kCALayerMaxXMinYCorner` (2) and `kCALayerMaxXMaxYCorner` (8).
    const RIGHT_CORNERS: usize = 0b1010;

    let result = view.with_webview(move |platform| {
        let view = platform.inner().cast::<AnyObject>();
        if view.is_null() {
            return;
        }
        // SAFETY: `inner` is the live `WKWebView`, and `with_webview` runs this
        // on the main thread, where AppKit objects may be used. Each message is
        // one the view or its layer answers, with the argument types it takes
        // (`CGFloat`, `CACornerMask`, `BOOL`).
        unsafe {
            let _: () = msg_send![&*view, setWantsLayer: Bool::YES];
            let layer: *mut AnyObject = msg_send![&*view, layer];
            if layer.is_null() {
                return;
            }
            let _: () = msg_send![&*layer, setCornerRadius: radius];
            let _: () = msg_send![&*layer, setMaskedCorners: RIGHT_CORNERS];
            let _: () = msg_send![&*layer, setMasksToBounds: Bool::new(radius > 0.0)];
        }
    });
    if let Err(error) = result {
        eprintln!("ILIAS corners: {error}");
    }
}

#[cfg(not(target_os = "macos"))]
fn round_card<R: Runtime>(_view: &tauri::Webview<R>, _radius: f64) {}

/// Gives the main webview the whole window back.
fn restore<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(view) = app.get_webview(ILIAS) {
        view.hide()
            .map_err(|error| format!("ILIAS could not be hidden: {error}"))?;
    }
    let window = app
        .get_window(MAIN)
        .ok_or_else(|| "The Uni Pilot window is gone.".to_string())?;
    // The gutter is gone with ILIAS; the window's own background returns.
    if let Err(error) = window.set_background_color(None) {
        eprintln!("ILIAS frame colour: {error}");
    }
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

/// Linux only: puts Uni Pilot and ILIAS into a horizontal `GtkPaned` in the
/// window's box, the first time, and sets the divider to the column's width.
///
/// Uni Pilot is moved in once and stays; an ILIAS webview Tauri has just put
/// into the box next to it (on entering, or after being closed and made again)
/// is moved in beside it. The paned ignores what the pages would like to be,
/// which is what the box got wrong. Nothing here closes or reloads either page.
#[cfg(target_os = "linux")]
fn stack<R: Runtime>(main: &tauri::Webview<R>, column: f64) -> Result<(), String> {
    main.with_webview(move |platform| {
        use gtk::prelude::*;

        let view = platform.inner();
        let Some(parent) = view.parent() else {
            return;
        };
        let paned = match parent.downcast::<gtk::Paned>() {
            Ok(paned) => paned,
            Err(parent) => {
                let Ok(stack) = parent.downcast::<gtk::Box>() else {
                    return;
                };
                let paned = gtk::Paned::new(gtk::Orientation::Horizontal);
                // `view` holds its own reference, so taking it out of the box
                // does not destroy it.
                stack.remove(&view);
                paned.pack1(&view, false, false);
                stack.pack_start(&paned, true, true, 0);
                paned.show();
                paned
            }
        };
        if paned.child2().is_none() {
            if let Some(stack) = paned
                .parent()
                .and_then(|parent| parent.downcast::<gtk::Box>().ok())
            {
                let ilias = stack
                    .children()
                    .into_iter()
                    .find_map(|child| child.downcast::<webkit2gtk::WebView>().ok());
                if let Some(ilias) = ilias {
                    stack.remove(&ilias);
                    paned.pack2(&ilias, true, true);
                }
            }
        }
        paned.set_position(column.round() as i32);
    })
    .map_err(|error| format!("Uni Pilot could not make room for ILIAS: {error}"))
}

fn current<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<Layout> {
    app.state::<Mode>().0.lock().ok().and_then(|layout| *layout)
}

fn remember<R: Runtime>(app: &tauri::AppHandle<R>, layout: Option<Layout>) {
    if let Ok(mut slot) = app.state::<Mode>().0.lock() {
        *slot = layout;
    }
}

/// Changes the layout in place, and only while ILIAS mode is on — a change that
/// arrives after leaving must not switch it back on.
fn amend<R: Runtime>(
    app: &tauri::AppHandle<R>,
    change: impl FnOnce(Layout) -> Layout,
) -> Option<(Layout, Layout)> {
    let mode = app.state::<Mode>();
    let mut slot = mode.0.lock().ok()?;
    let before = (*slot)?;
    let after = change(before);
    *slot = Some(after);
    Some((before, after))
}

/// Switches the window to ILIAS mode, creating the ILIAS webview the first time.
///
/// `column` is the left column's width (rail and panel) and `gutter` the
/// frame's, both as the page laid them out; `frame` is the frame's colour as
/// red, green and blue, for the window behind the gutter. `page_height` is the
/// page's height before anything shrinks, which with the window gives the title
/// bar. `target: None` keeps the page ILIAS was on; a string navigates, `""`
/// meaning the dashboard.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn enter_ilias_mode(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    target: Option<String>,
    column: f64,
    gutter: f64,
    frame: Option<[u8; 3]>,
    page_height: f64,
) -> Result<(), String> {
    check_metrics(column, gutter)?;
    // Resolved even when not navigating, so a bad configuration fails here
    // rather than leaving the window laid out around nothing.
    let url = resolve_target(&base_url, &client_id, target.as_deref())?;

    let window = app
        .get_window(MAIN)
        .ok_or_else(|| "ILIAS could not be opened: the Uni Pilot window is gone.".to_string())?;

    // Measured only on the way in, while the page still has the window's
    // height — which it keeps in the column too, but a gap measured against
    // anything else must not be believed (see `titlebar_offset`).
    let layout = match current(&app) {
        Some(known) => Layout {
            column,
            gutter,
            frame,
            ..known
        },
        None => {
            let (_, window_height) = logical_size(&window)?;
            let fullscreen = window.is_fullscreen().unwrap_or(false);
            Layout {
                column,
                gutter,
                frame,
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
                        WebviewBuilder::new(ILIAS, WebviewUrl::External(url.clone()))
                            .on_download(ilias_browser::on_download)
                            .on_new_window(ilias_links::on_new_window(app.clone(), ILIAS, url))
                            .on_page_load(ilias_browser::on_page_load),
                        LogicalPosition::new(0.0, 0.0),
                        LogicalSize::new(0.0, 0.0),
                    )
                    .map_err(|error| format!("ILIAS could not be opened: {error}"))?;
                ilias_browser::prepare(&view);
            }
        }
    }

    apply(&app, layout)?;
    style(&app, layout);
    Ok(())
}

/// Tells Rust the column, gutter or frame colour changed — the theme was
/// switched, say — while ILIAS mode is on. Nothing happens when it is not: the
/// next `enter_ilias_mode` carries the numbers anyway.
#[tauri::command]
pub async fn set_ilias_layout(
    app: tauri::AppHandle,
    column: f64,
    gutter: f64,
    frame: Option<[u8; 3]>,
) -> Result<(), String> {
    check_metrics(column, gutter)?;
    let Some((before, after)) = amend(&app, |known| Layout {
        column,
        gutter,
        frame,
        ..known
    }) else {
        return Ok(());
    };
    if after == before {
        return Ok(());
    }
    apply(&app, after)?;
    style(&app, after);
    Ok(())
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
/// a course, a deep link that arrives while the page is already open.
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
    use super::{arrange, check_metrics, titlebar_offset, Rect, TITLEBAR_FALLBACK};

    #[test]
    fn puts_the_column_at_the_left_and_ilias_beside_it_under_the_title_bar() {
        let (column, ilias) = arrange(1440.0, 900.0, 28.0, 312.0, 8.0);
        assert_eq!(
            column,
            Rect {
                x: 0.0,
                y: 0.0,
                width: 312.0,
                height: 900.0
            }
        );
        assert_eq!(
            ilias,
            Rect {
                x: 312.0,
                y: 36.0,
                width: 1120.0,
                height: 856.0
            }
        );
    }

    /// The two never overlap — overlapping is what made the cursor flicker —
    /// and ILIAS stays inside the window, whatever the window's size.
    #[test]
    fn leaves_no_overlap_between_the_column_and_ilias() {
        for (width, height, titlebar, column, gutter) in [
            (1440.0, 900.0, 28.0, 312.0, 8.0),
            (1024.0, 680.0, 0.0, 312.0, 8.0),
            (2560.0, 1440.0, 28.0, 480.0, 16.0),
            (400.0, 300.0, 28.0, 312.0, 8.0),
            (200.0, 100.0, 28.0, 640.0, 32.0),
            (1200.0, 800.0, 0.0, 312.0, 0.0),
        ] {
            let (left, ilias) = arrange(width, height, titlebar, column, gutter);
            assert!(
                left.x + left.width <= ilias.x,
                "overlap in {width}x{height}"
            );
            assert!(ilias.x + ilias.width <= width, "past the right edge");
            assert!(ilias.y + ilias.height <= height, "past the bottom edge");
            assert!(ilias.y >= titlebar, "under the title bar");
            assert!(
                left.height == height && left.y == 0.0,
                "column not full height"
            );
        }
    }

    /// ILIAS sits clear of the title bar, then of the gutter, and ends a gutter
    /// short of the right and bottom edges; its left edge joins the panel.
    #[test]
    fn leaves_the_frames_gutter_above_right_and_below_ilias() {
        let (_, ilias) = arrange(1000.0, 700.0, 28.0, 300.0, 8.0);
        assert_eq!(ilias.x, 300.0);
        assert_eq!(ilias.y, 36.0);
        assert_eq!(1000.0 - (ilias.x + ilias.width), 8.0);
        assert_eq!(700.0 - (ilias.y + ilias.height), 8.0);
    }

    #[test]
    fn needs_no_gutter_where_there_is_none() {
        let (_, ilias) = arrange(1000.0, 700.0, 0.0, 300.0, 0.0);
        assert_eq!(
            ilias,
            Rect {
                x: 300.0,
                y: 0.0,
                width: 700.0,
                height: 700.0
            }
        );
    }

    #[test]
    fn never_gives_ilias_a_negative_size() {
        let (_, ilias) = arrange(800.0, 40.0, 28.0, 312.0, 8.0);
        assert_eq!(ilias.height, 0.0);
        let (column, ilias) = arrange(100.0, 600.0, 0.0, 312.0, 8.0);
        assert_eq!(column.width, 100.0);
        assert_eq!(ilias.width, 0.0);
        let (_, ilias) = arrange(0.0, 0.0, 28.0, 312.0, 8.0);
        assert_eq!((ilias.width, ilias.height), (0.0, 0.0));
    }

    /// A column nobody could use is clamped, not believed; so is a gutter.
    #[test]
    fn clamps_the_column_and_the_gutter_to_something_sane() {
        let (thin, _) = arrange(1440.0, 900.0, 0.0, 10.0, 8.0);
        assert_eq!(thin.width, 96.0);
        let (wide, _) = arrange(1440.0, 900.0, 0.0, 5000.0, 8.0);
        assert_eq!(wide.width, 640.0);
        let (_, ilias) = arrange(1440.0, 900.0, 0.0, 312.0, 200.0);
        assert_eq!(ilias.y, 32.0);
        let (_, ilias) = arrange(1440.0, 900.0, 0.0, 312.0, -5.0);
        assert_eq!(ilias.y, 0.0);
    }

    /// Full width: ILIAS is not confined to a reading column.
    #[test]
    fn gives_ilias_all_the_width_the_column_leaves() {
        let (column, ilias) = arrange(2560.0, 1440.0, 0.0, 312.0, 8.0);
        assert_eq!(ilias.x, column.width);
        assert_eq!(ilias.width, 2560.0 - 312.0 - 8.0);
    }

    #[test]
    fn accepts_what_a_page_can_measure() {
        assert!(check_metrics(312.0, 8.0).is_ok());
        assert!(check_metrics(96.0, 0.0).is_ok());
        assert!(check_metrics(640.0, 32.0).is_ok());
    }

    #[test]
    fn refuses_a_layout_that_is_not_one() {
        for (column, gutter) in [
            (f64::NAN, 8.0),
            (312.0, f64::NAN),
            (f64::INFINITY, 8.0),
            (0.0, 8.0),
            (95.0, 8.0),
            (641.0, 8.0),
            (312.0, -1.0),
            (312.0, 33.0),
        ] {
            assert!(check_metrics(column, gutter).is_err(), "{column} {gutter}");
        }
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

    /// Measured against a page that was not the window's height, the gap is
    /// not a title bar. The known height is used instead.
    #[test]
    fn distrusts_a_gap_no_title_bar_could_be() {
        assert_eq!(titlebar_offset(900.0, 48.0), TITLEBAR_FALLBACK);
    }
}
