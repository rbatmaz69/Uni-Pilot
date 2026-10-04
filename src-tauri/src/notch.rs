//! Face unlock in the notch (macOS): a small see-through window over the
//! MacBook's camera housing that shows how a face unlock goes — a little
//! face that wakes up, looks for the student, smiles and signs in.
//!
//! The window only paints. It gets no commands (`capabilities/notch.json`
//! allows events only): the camera, the frames and every face command stay
//! with Uni Pilot's own page, which tells Rust what to show (`notch_show`,
//! `notch_hide`), and Rust hands that on to the notch page as `notch-state`.
//! What goes there is a phase and a sentence — never a frame, a score or
//! anything stored.
//!
//! The notch page talks back with three events, all harmless if forged:
//! `notch-ready` (send the last state again), `notch-hit` (where the island
//! is, so clicks elsewhere fall through to the menu bar) and `notch-action`
//! (a click: Uni Pilot comes to the front for `open`, `password` and `retry`;
//! the page reacts to every action itself).
//!
//! Macs without a notch, and every other platform, answer `false`: the page
//! then shows the same island inside its own window.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener, Manager, Webview};

use crate::ilias_sync::sign_in::is_main;

pub const LABEL: &str = "notch";
const STATE_EVENT: &str = "notch-state";

/// The window spans the island at its widest; the island grows inside it.
const WIDTH: f64 = 560.0;
/// Room below the notch for the opened island.
const BELOW: f64 = 150.0;
/// The page's collapse animation, before the window goes.
#[cfg(target_os = "macos")]
const COLLAPSE_MS: u64 = 450;
/// A sentence, not a document.
const MAX_TEXT: usize = 280;

/// What face unlock is doing, as the page saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Starting,
    Looking,
    SigningIn,
    SignedIn,
    Paused,
    Stopped,
}

/// What Uni Pilot's page asks the notch to show.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shown {
    phase: Phase,
    text: String,
    #[serde(default)]
    again: bool,
    #[serde(default)]
    camera: bool,
}

/// What the notch page gets: the request and the notch's size.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Painted {
    phase: Phase,
    text: String,
    again: bool,
    camera: bool,
    notch_width: f64,
    notch_height: f64,
}

impl Painted {
    fn new(shown: Shown, notch_width: f64, notch_height: f64) -> Self {
        Self {
            phase: shown.phase,
            text: shown.text.chars().take(MAX_TEXT).collect(),
            again: shown.again,
            camera: shown.camera,
            notch_width,
            notch_height,
        }
    }
}

/// Where the island is in the notch window, in points from its top left.
#[derive(Debug, Clone, Copy, Default, PartialEq, Deserialize)]
pub struct Hit {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Hit {
    fn contains(&self, x: f64, y: f64) -> bool {
        self.width > 0.0
            && self.height > 0.0
            && x >= self.x
            && x <= self.x + self.width
            && y >= self.y
            && y <= self.y + self.height
    }
}

/// A rectangle in AppKit's coordinates: points, origin at the bottom left of
/// the main screen.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Frame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// The window's frame: centred on the screen, its top edge on the screen's.
fn placement(screen: Frame, notch_height: f64) -> Frame {
    let height = notch_height + BELOW;
    Frame {
        x: (screen.x + (screen.width - WIDTH) / 2.0).round(),
        y: screen.y + screen.height - height,
        width: WIDTH,
        height,
    }
}

/// A point on the screen (AppKit) as a point in the window, from its top left.
fn in_window(window: Frame, x: f64, y: f64) -> (f64, f64) {
    (x - window.x, window.y + window.height - y)
}

/// The notch window's state, managed by Tauri.
#[derive(Default)]
pub struct Notch {
    last: Mutex<Option<Painted>>,
    hit: Mutex<Hit>,
    visible: AtomicBool,
    /// Bumped on every show and hide, so a late hide does not undo a show.
    turn: AtomicU64,
}

impl Notch {
    fn hit(&self) -> Hit {
        *self.hit.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn remember(&self, painted: Option<Painted>) {
        *self.last.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = painted;
    }

    fn last(&self) -> Option<Painted> {
        self.last
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

fn from_main(webview: &Webview) -> Result<(), String> {
    if is_main(webview.label()) {
        Ok(())
    } else {
        Err("Only Uni Pilot's own window can use the notch.".into())
    }
}

/// Shows `state` in the notch. `false` when there is no notch to show it in —
/// no notch on this Mac, or not a Mac — and the page shows it itself.
#[tauri::command]
pub async fn notch_show(app: AppHandle, webview: Webview, state: Shown) -> Result<bool, String> {
    from_main(&webview)?;
    #[cfg(target_os = "macos")]
    {
        macos::show(&app, state).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state);
        Ok(false)
    }
}

/// The island folds back into the notch, then the window goes.
#[tauri::command]
pub async fn notch_hide(app: AppHandle, webview: Webview) -> Result<(), String> {
    from_main(&webview)?;
    let notch = app.state::<Notch>();
    let turn = notch.turn.fetch_add(1, Ordering::SeqCst) + 1;
    notch.visible.store(false, Ordering::SeqCst);
    notch.remember(None);
    if app.get_webview_window(LABEL).is_none() {
        return Ok(());
    }
    let _ = app.emit_to(LABEL, STATE_EVENT, Option::<Painted>::None);
    #[cfg(target_os = "macos")]
    {
        tokio::time::sleep(std::time::Duration::from_millis(COLLAPSE_MS)).await;
        if notch.turn.load(Ordering::SeqCst) == turn {
            macos::order_out(&app).await?;
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = turn;
    Ok(())
}

#[derive(Deserialize)]
struct Action {
    action: String,
}

/// The notch page's three events. Called once, at start.
pub fn listen(app: &AppHandle) {
    let handle = app.clone();
    app.listen_any("notch-ready", move |_| {
        let last = handle.state::<Notch>().last();
        if last.is_some() {
            let _ = handle.emit_to(LABEL, STATE_EVENT, last);
        }
    });

    let handle = app.clone();
    app.listen_any("notch-hit", move |event| {
        if let Ok(hit) = serde_json::from_str::<Hit>(event.payload()) {
            *handle
                .state::<Notch>()
                .hit
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = hit;
        }
    });

    let handle = app.clone();
    app.listen_any("notch-action", move |event| {
        let Ok(Action { action }) = serde_json::from_str::<Action>(event.payload()) else {
            return;
        };
        // Cancel needs nothing from here; the page closes the bar itself.
        if matches!(action.as_str(), "open" | "password" | "retry") {
            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }
    });
}

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    use objc2::rc::Retained;
    use objc2::runtime::NSObjectProtocol;
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::{
        NSEvent, NSScreen, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

    use super::{in_window, placement, Frame, Notch, Painted, Shown, LABEL, STATE_EVENT, WIDTH};

    /// How often the pointer is checked, to let clicks beside the island through.
    const POINTER_MS: u64 = 60;

    #[derive(Clone, Copy)]
    struct Geometry {
        screen: Frame,
        notch_width: f64,
        notch_height: f64,
    }

    async fn on_main<T: Send + 'static>(
        app: &AppHandle,
        work: impl FnOnce(MainThreadMarker) -> T + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            if let Some(mtm) = MainThreadMarker::new() {
                let _ = tx.send(work(mtm));
            }
        })
        .map_err(|error| error.to_string())?;
        rx.await
            .map_err(|_| "The main thread did not answer.".to_string())
    }

    /// The screen with a notch, if any. `safeAreaInsets` and the auxiliary
    /// areas came with macOS 12; Uni Pilot runs from 11, so ask first.
    fn geometry(mtm: MainThreadMarker) -> Option<Geometry> {
        let screens = NSScreen::screens(mtm);
        (0..screens.count()).find_map(|index| {
            let screen: Retained<NSScreen> = screens.objectAtIndex(index);
            if !screen.respondsToSelector(sel!(safeAreaInsets))
                || !screen.respondsToSelector(sel!(auxiliaryTopLeftArea))
            {
                return None;
            }
            let top = screen.safeAreaInsets().top;
            let left = screen.auxiliaryTopLeftArea().size.width;
            let right = screen.auxiliaryTopRightArea().size.width;
            let frame = screen.frame();
            let notch_width = frame.size.width - left - right;
            (top > 0.0 && left > 0.0 && right > 0.0 && notch_width > 0.0).then_some(Geometry {
                screen: Frame {
                    x: frame.origin.x,
                    y: frame.origin.y,
                    width: frame.size.width,
                    height: frame.size.height,
                },
                notch_width,
                notch_height: top,
            })
        })
    }

    /// # Safety
    /// On the main thread, with the window alive — Tauri keeps it while the
    /// handle exists.
    unsafe fn ns_window(window: &WebviewWindow) -> Option<&NSWindow> {
        let pointer = window.ns_window().ok()?;
        (pointer as *const NSWindow).as_ref()
    }

    fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
        let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("notch.html".into()))
            .title("Uni Pilot face unlock")
            .inner_size(WIDTH, 200.0)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            // Never key: a click here must not take the focus from Uni Pilot's
            // window, or the camera would stop (it stops on blur).
            .focusable(false)
            .focused(false)
            .accept_first_mouse(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .map_err(|error| error.to_string())?;
        follow_pointer(app.clone());
        Ok(window)
    }

    /// The window is wider than the island: clicks beside it go to whatever
    /// lies below — the menu bar — unless the pointer is over the island.
    fn follow_pointer(app: AppHandle) {
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(POINTER_MS));
            let notch = app.state::<Notch>();
            if !notch.visible.load(Ordering::SeqCst) {
                continue;
            }
            let hit = notch.hit();
            let Some(window) = app.get_webview_window(LABEL) else {
                return;
            };
            let _ = app.run_on_main_thread(move || {
                // SAFETY: on the main thread, `window` held.
                let Some(ns) = (unsafe { ns_window(&window) }) else {
                    return;
                };
                let frame = ns.frame();
                let pointer = NSEvent::mouseLocation();
                let (x, y) = in_window(
                    Frame {
                        x: frame.origin.x,
                        y: frame.origin.y,
                        width: frame.size.width,
                        height: frame.size.height,
                    },
                    pointer.x,
                    pointer.y,
                );
                ns.setIgnoresMouseEvents(!hit.contains(x, y));
            });
        });
    }

    pub async fn show(app: &AppHandle, shown: Shown) -> Result<bool, String> {
        let Some(geometry) = on_main(app, geometry).await? else {
            return Ok(false);
        };
        let window = match app.get_webview_window(LABEL) {
            Some(window) => window,
            None => create(app)?,
        };
        let painted = Painted::new(shown, geometry.notch_width, geometry.notch_height);
        let notch = app.state::<Notch>();
        notch.turn.fetch_add(1, Ordering::SeqCst);
        notch.remember(Some(painted.clone()));
        let _ = app.emit_to(LABEL, STATE_EVENT, Some(painted));
        let was_visible = notch.visible.swap(true, Ordering::SeqCst);

        on_main(app, move |_| {
            // SAFETY: on the main thread, `window` held.
            let Some(ns) = (unsafe { ns_window(&window) }) else {
                return;
            };
            let frame = placement(geometry.screen, geometry.notch_height);
            ns.setFrame_display(
                NSRect::new(
                    NSPoint::new(frame.x, frame.y),
                    NSSize::new(frame.width, frame.height),
                ),
                true,
            );
            // Above the menu bar (NSMainMenuWindowLevel is 24), on every
            // Space and next to full-screen apps, never in ⌘` or Mission Control.
            ns.setLevel(NSStatusWindowLevel);
            ns.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::Stationary
                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                    | NSWindowCollectionBehavior::IgnoresCycle,
            );
            ns.setHasShadow(false);
            if !was_visible {
                ns.setIgnoresMouseEvents(true);
            }
            // Front without becoming key or activating Uni Pilot.
            ns.orderFrontRegardless();
        })
        .await?;
        Ok(true)
    }

    pub async fn order_out(app: &AppHandle) -> Result<(), String> {
        let Some(window) = app.get_webview_window(LABEL) else {
            return Ok(());
        };
        on_main(app, move |_| {
            // SAFETY: on the main thread, `window` held.
            if let Some(ns) = unsafe { ns_window(&window) } {
                ns.setIgnoresMouseEvents(true);
                ns.orderOut(None);
            }
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shown(text: &str) -> Shown {
        serde_json::from_value(serde_json::json!({ "phase": "looking", "text": text })).unwrap()
    }

    #[test]
    fn reads_what_the_page_asks_for() {
        let asked: Shown = serde_json::from_value(serde_json::json!({
            "phase": "signingIn",
            "text": "Signing in",
            "again": true,
            "camera": true,
        }))
        .unwrap();
        assert_eq!(asked.phase, Phase::SigningIn);
        assert!(asked.again && asked.camera);

        let plain = shown("Look at the camera");
        assert!(!plain.again && !plain.camera);
    }

    #[test]
    fn refuses_an_unknown_phase() {
        let asked = serde_json::from_value::<Shown>(serde_json::json!({
            "phase": "unlockEverything",
            "text": "",
        }));
        assert!(asked.is_err());
    }

    #[test]
    fn hands_on_a_sentence_and_the_notch_size_only() {
        let painted = Painted::new(shown(&"a".repeat(1000)), 185.0, 32.0);
        assert_eq!(painted.text.chars().count(), MAX_TEXT);
        let json = serde_json::to_value(&painted).unwrap();
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            ["again", "camera", "notchHeight", "notchWidth", "phase", "text"]
        );
    }

    #[test]
    fn places_the_window_under_the_notch() {
        let screen = Frame {
            x: 0.0,
            y: 0.0,
            width: 1512.0,
            height: 982.0,
        };
        let frame = placement(screen, 38.0);
        assert_eq!(frame.width, WIDTH);
        assert_eq!(frame.height, 38.0 + BELOW);
        assert_eq!(frame.x, (1512.0 - WIDTH) / 2.0);
        assert_eq!(frame.y + frame.height, 982.0);

        // A notched screen beside or above the main one.
        let other = Frame {
            x: -1512.0,
            y: 200.0,
            ..screen
        };
        let frame = placement(other, 32.0);
        assert_eq!(frame.x + frame.width / 2.0, -1512.0 / 2.0);
        assert_eq!(frame.y + frame.height, 1182.0);
    }

    #[test]
    fn turns_screen_points_into_window_points() {
        let window = Frame {
            x: 476.0,
            y: 794.0,
            width: WIDTH,
            height: 188.0,
        };
        assert_eq!(in_window(window, 476.0, 982.0), (0.0, 0.0));
        assert_eq!(in_window(window, 576.0, 932.0), (100.0, 50.0));
    }

    #[test]
    fn lets_clicks_through_beside_the_island() {
        let hit = Hit {
            x: 100.0,
            y: 0.0,
            width: 360.0,
            height: 140.0,
        };
        assert!(hit.contains(100.0, 0.0));
        assert!(hit.contains(280.0, 70.0));
        assert!(!hit.contains(99.0, 70.0));
        assert!(!hit.contains(280.0, 141.0));
        assert!(!Hit::default().contains(0.0, 0.0));
    }
}
