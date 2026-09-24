//! What makes the ILIAS webview a browser: back and forward, and downloads.
//!
//! Both are done natively, through the platform's own webview — never with
//! script in the ILIAS page. Students type their university password there, and
//! the rule in `ilias_window.rs` holds without exception: nothing is injected.
//!
//! **Downloads.** Without a download handler, the webview silently cancels
//! every download — a PDF from a course simply never arrived. Here each one is
//! saved to the Downloads folder under a name we check ourselves, and the strip
//! is told when it starts and when it ends. The strip can then open the file or
//! show it in its folder, but only files this module saved, looked up by an id
//! it handed out — the page never names a path. Opening is further limited to
//! documents and media; anything that could run is only ever shown in its
//! folder.
//!
//! **History.** Tauri has no back or forward, so they go straight to the
//! webview: `WKWebView` on macOS, WebView2 on Windows, WebKitGTK on Linux.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, PageLoadEvent, PageLoadPayload, PlatformWebview};
use tauri::{Emitter, Manager, Runtime, Webview};

use crate::ilias_view::ILIAS;

/// The only webview told about downloads and history: Uni Pilot's own.
const MAIN: &str = "main";
const DOWNLOAD_EVENT: &str = "ilias-download";
const HISTORY_EVENT: &str = "ilias-history";

/// How many downloads are remembered for opening. Older ones stay on disk,
/// they just can no longer be opened from the strip.
const KEEP: usize = 20;

/// Used when the server suggests no usable name at all.
const FALLBACK_NAME: &str = "download";

/// Longest file name we write, in characters. File systems stop at 255 bytes.
const NAME_MAX: usize = 120;

/// Opened with the default app on request. Documents and media only: nothing
/// here runs code when opened. Everything else can still be shown in its
/// folder, where opening it is the student's own, deliberate step.
const OPENABLE: &[&str] = &[
    "pdf", "txt", "md", "csv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
    "odp", "png", "jpg", "jpeg", "gif", "webp", "heic", "mp3", "m4a", "wav", "mp4", "mov", "zip",
];

// --- downloads --------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum State {
    Started,
    Finished,
    Failed,
}

#[derive(Debug)]
struct Entry {
    id: u64,
    url: String,
    path: PathBuf,
    state: State,
}

/// What the strip is told. The file name only — never the path.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    id: u64,
    file_name: String,
    state: State,
    openable: bool,
}

impl Entry {
    fn report(&self) -> Report {
        Report {
            id: self.id,
            file_name: self
                .path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            state: self.state,
            openable: is_openable(&self.path),
        }
    }
}

/// The downloads of this session, newest last.
#[derive(Debug, Default)]
struct Book {
    next_id: u64,
    entries: VecDeque<Entry>,
}

impl Book {
    fn start(&mut self, url: String, path: PathBuf) -> Report {
        self.next_id += 1;
        let entry = Entry {
            id: self.next_id,
            url,
            path,
            state: State::Started,
        };
        let report = entry.report();
        self.entries.push_back(entry);
        // Only finished ones are let go; one still running must be found again.
        while self.entries.len() > KEEP {
            match self
                .entries
                .iter()
                .position(|entry| entry.state != State::Started)
            {
                Some(oldest) => {
                    self.entries.remove(oldest);
                }
                None => break,
            }
        }
        report
    }

    /// The webview reports the end by the URL it started with — on macOS
    /// without the path. The same file twice at once ends in the order it began.
    fn finish(&mut self, url: &str, success: bool) -> Option<Report> {
        let entry = self
            .entries
            .iter_mut()
            .find(|entry| entry.state == State::Started && entry.url == url)?;
        entry.state = if success {
            State::Finished
        } else {
            State::Failed
        };
        Some(entry.report())
    }

    /// A path is taken while a download is still writing to it, even before
    /// the file exists on disk.
    fn is_taken(&self, path: &Path) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.state == State::Started && entry.path == path)
    }

    fn saved(&self, id: u64) -> Option<&Path> {
        self.entries
            .iter()
            .find(|entry| entry.id == id && entry.state == State::Finished)
            .map(|entry| entry.path.as_path())
    }
}

#[derive(Default)]
pub struct Downloads(Mutex<Book>);

/// Makes a name the server suggested safe to write: no folders, nothing a file
/// system refuses, not hidden, not endless.
fn safe_file_name(suggested: &str) -> String {
    let last = suggested.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = last
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        return FALLBACK_NAME.into();
    }

    let (stem, extension) = split_extension(trimmed);
    let reserved = matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "LPT1" | "LPT2" | "LPT3"
    );
    let stem = if reserved {
        format!("_{stem}")
    } else {
        stem.to_string()
    };
    let room = NAME_MAX.saturating_sub(extension.chars().count()).max(1);
    let stem: String = stem.chars().take(room).collect();
    format!("{}{extension}", stem.trim_end())
}

/// `"notes.v2.pdf"` → `("notes.v2", ".pdf")`. A name that is only an
/// extension, like `".pdf"`, has none.
fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(dot) if dot > 0 => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    }
}

/// The first of `name`, `name (1)`, `name (2)` … that is free in `dir`. Nothing
/// already there is ever overwritten.
fn free_path(dir: &Path, name: &str, taken: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(name);
    if !taken(&first) {
        return first;
    }
    let (stem, extension) = split_extension(name);
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|path| !taken(path))
        .unwrap_or(first)
}

fn is_openable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| OPENABLE.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn tell<R: Runtime, T: Serialize + Clone + Send + 'static>(
    app: &tauri::AppHandle<R>,
    event: &'static str,
    payload: T,
) {
    // Sent from a task, not from here: this runs inside the webview's own
    // callbacks on the main thread, and a message to another webview from
    // there would re-enter the event loop mid-callback.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit_to(MAIN, event, payload);
    });
}

/// The download hook for every ILIAS webview. Returning `true` lets the
/// download go ahead — without this hook, the webview cancels it.
pub fn on_download<R: Runtime>(view: Webview<R>, event: DownloadEvent<'_>) -> bool {
    let app = view.app_handle();
    match event {
        DownloadEvent::Requested { url, destination } => {
            let Ok(dir) = app.path().download_dir() else {
                eprintln!("ILIAS download: there is no Downloads folder.");
                return false;
            };
            let suggested = destination
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            let name = safe_file_name(&suggested);
            let downloads = app.state::<Downloads>();
            let report = {
                let Ok(mut book) = downloads.0.lock() else {
                    return false;
                };
                let path = free_path(&dir, &name, |path| path.exists() || book.is_taken(path));
                *destination = path.clone();
                book.start(url.to_string(), path)
            };
            tell(app, DOWNLOAD_EVENT, report);
            true
        }
        DownloadEvent::Finished { url, success, .. } => {
            let report = app
                .state::<Downloads>()
                .0
                .lock()
                .ok()
                .and_then(|mut book| book.finish(url.as_str(), success));
            if let Some(report) = report {
                tell(app, DOWNLOAD_EVENT, report);
            }
            true
        }
        _ => true,
    }
}

fn saved_path<R: Runtime>(app: &tauri::AppHandle<R>, id: u64) -> Result<PathBuf, String> {
    let downloads = app.state::<Downloads>();
    let book = downloads
        .0
        .lock()
        .map_err(|_| "The download list is unavailable.".to_string())?;
    let path = book
        .saved(id)
        .ok_or_else(|| "Uni Pilot no longer knows this download.".to_string())?
        .to_path_buf();
    if path.exists() {
        Ok(path)
    } else {
        Err("The file is no longer there — it may have been moved or deleted.".into())
    }
}

/// Runs a system opener and lets it go; it exits on its own once the file is
/// handed over. Waited for on a thread so it does not linger as a zombie.
fn launch(program: &str, args: &[std::ffi::OsString]) -> Result<(), String> {
    let mut child = std::process::Command::new(program)
        .args(args)
        .spawn()
        .map_err(|error| format!("The file could not be opened: {error}"))?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// Opens a finished download with its default app — documents and media only.
#[tauri::command]
pub async fn open_ilias_download(app: tauri::AppHandle, id: u64) -> Result<(), String> {
    let path = saved_path(&app, id)?;
    if !is_openable(&path) {
        return Err(
            "Uni Pilot only opens documents and media. Find this file in its folder.".into(),
        );
    }
    #[cfg(target_os = "macos")]
    return launch("open", &[path.into()]);
    #[cfg(windows)]
    return launch("explorer", &[path.into()]);
    #[cfg(not(any(target_os = "macos", windows)))]
    return launch("xdg-open", &[path.into()]);
}

/// Shows a finished download in its folder.
#[tauri::command]
pub async fn reveal_ilias_download(app: tauri::AppHandle, id: u64) -> Result<(), String> {
    let path = saved_path(&app, id)?;
    #[cfg(target_os = "macos")]
    return launch("open", &["-R".into(), path.into()]);
    #[cfg(windows)]
    return launch("explorer", &[format!("/select,{}", path.display()).into()]);
    #[cfg(not(any(target_os = "macos", windows)))]
    return launch("xdg-open", &[path.parent().unwrap_or(&path).into()]);
}

// --- history ----------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Step {
    Back,
    Forward,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    can_go_back: bool,
    can_go_forward: bool,
}

/// The platform's own webview, reached without script. `None` where the
/// platform gives no answer.
mod native {
    use super::{History, PlatformWebview, Step};

    #[cfg(target_os = "macos")]
    pub fn act(platform: PlatformWebview, step: Option<Step>) -> Option<History> {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;

        let view = platform.inner().cast::<AnyObject>();
        if view.is_null() {
            return None;
        }
        // SAFETY: `inner` is the live `WKWebView`, and `with_webview` runs this
        // on the main thread, where WebKit must be called.
        unsafe {
            let view = &*view;
            match step {
                Some(Step::Back) => {
                    let _: *mut AnyObject = msg_send![view, goBack];
                }
                Some(Step::Forward) => {
                    let _: *mut AnyObject = msg_send![view, goForward];
                }
                None => {}
            }
            Some(History {
                can_go_back: msg_send![view, canGoBack],
                can_go_forward: msg_send![view, canGoForward],
            })
        }
    }

    #[cfg(windows)]
    pub fn act(platform: PlatformWebview, step: Option<Step>) -> Option<History> {
        // SAFETY: the controller belongs to the live webview, and `with_webview`
        // runs this on the thread WebView2 was created on.
        unsafe {
            let core = platform.controller().CoreWebView2().ok()?;
            match step {
                Some(Step::Back) => core.GoBack().ok()?,
                Some(Step::Forward) => core.GoForward().ok()?,
                None => {}
            }
            let mut back = windows::core::BOOL::default();
            let mut forward = windows::core::BOOL::default();
            core.CanGoBack(&mut back).ok()?;
            core.CanGoForward(&mut forward).ok()?;
            Some(History {
                can_go_back: back.as_bool(),
                can_go_forward: forward.as_bool(),
            })
        }
    }

    #[cfg(target_os = "linux")]
    pub fn act(platform: PlatformWebview, step: Option<Step>) -> Option<History> {
        use webkit2gtk::WebViewExt;

        let view = platform.inner();
        match step {
            Some(Step::Back) => view.go_back(),
            Some(Step::Forward) => view.go_forward(),
            None => {}
        }
        Some(History {
            can_go_back: view.can_go_back(),
            can_go_forward: view.can_go_forward(),
        })
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    pub fn act(_platform: PlatformWebview, _step: Option<Step>) -> Option<History> {
        None
    }

    /// Two-finger swipe for back and forward, as in Safari. WebView2 has it on
    /// by default; WebKitGTK has no such gesture.
    #[cfg(target_os = "macos")]
    pub fn allow_swipe(platform: PlatformWebview) {
        use objc2::msg_send;
        use objc2::runtime::{AnyObject, Bool};

        let view = platform.inner().cast::<AnyObject>();
        if view.is_null() {
            return;
        }
        // SAFETY: as in `act` — the live `WKWebView`, on the main thread.
        unsafe {
            let _: () = msg_send![&*view, setAllowsBackForwardNavigationGestures: Bool::YES];
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn allow_swipe(_platform: PlatformWebview) {}
}

/// Sets up a freshly created ILIAS webview as a browser: swipe to go back.
pub fn prepare<R: Runtime>(view: &Webview<R>) {
    if let Err(error) = view.with_webview(native::allow_swipe) {
        // Only the gesture is lost; the buttons still work.
        eprintln!("ILIAS swipe navigation: {error}");
    }
}

/// Takes a step (or none) and tells the strip where ILIAS now stands.
fn act_and_tell<R: Runtime>(view: &Webview<R>, step: Option<Step>) -> tauri::Result<()> {
    let app = view.app_handle().clone();
    view.with_webview(move |platform| {
        if let Some(history) = native::act(platform, step) {
            tell(&app, HISTORY_EVENT, history);
        }
    })
}

/// Page-load hook for the ILIAS webview: each finished page may have changed
/// what back and forward can do.
pub fn on_page_load<R: Runtime>(view: Webview<R>, payload: PageLoadPayload<'_>) {
    if payload.event() == PageLoadEvent::Finished {
        // From a task: this hook runs inside a webview callback, and reaching
        // into the webview again from there would re-enter it.
        tauri::async_runtime::spawn(async move {
            let _ = act_and_tell(&view, None);
        });
    }
}

/// Goes back or forward in ILIAS, like a browser's buttons.
#[tauri::command]
pub async fn travel_ilias(app: tauri::AppHandle, step: Step) -> Result<(), String> {
    let view = app
        .get_webview(ILIAS)
        .ok_or_else(|| "ILIAS is not open.".to_string())?;
    act_and_tell(&view, Some(step)).map_err(|error| format!("ILIAS could not go there: {error}"))
}

/// Where ILIAS stands now — for a strip that has just appeared and missed the
/// last page load. Nothing to go back to while ILIAS is not open.
#[tauri::command]
pub async fn ilias_history(app: tauri::AppHandle) -> Result<History, String> {
    let Some(view) = app.get_webview(ILIAS) else {
        return Ok(History::default());
    };
    let (sender, receiver) = std::sync::mpsc::channel();
    view.with_webview(move |platform| {
        let _ = sender.send(native::act(platform, None));
    })
    .map_err(|error| format!("ILIAS could not be asked: {error}"))?;
    let answer =
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(2)))
            .await
            .map_err(|error| format!("ILIAS could not be asked: {error}"))?;
    Ok(answer.ok().flatten().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{free_path, is_openable, safe_file_name, Book, State};

    #[test]
    fn keeps_an_ordinary_name() {
        assert_eq!(
            safe_file_name("Vorlesung 3 – Folien.pdf"),
            "Vorlesung 3 – Folien.pdf"
        );
    }

    /// A name from a server must never reach outside the Downloads folder.
    #[test]
    fn strips_any_folder_from_the_name() {
        assert_eq!(
            safe_file_name("../../.ssh/authorized_keys"),
            "authorized_keys"
        );
        assert_eq!(safe_file_name("..\\..\\evil.bat"), "evil.bat");
        assert_eq!(safe_file_name("/etc/passwd"), "passwd");
    }

    #[test]
    fn replaces_what_a_file_system_refuses() {
        assert_eq!(safe_file_name("a:b*c?.pdf"), "a_b_c_.pdf");
        assert_eq!(safe_file_name("tab\there.txt"), "tab_here.txt");
    }

    #[test]
    fn never_writes_a_hidden_or_empty_name() {
        assert_eq!(safe_file_name(".bashrc"), "bashrc");
        assert_eq!(safe_file_name(" ... "), "download");
        assert_eq!(safe_file_name(""), "download");
        assert_eq!(safe_file_name("folder/"), "download");
    }

    #[test]
    fn avoids_names_windows_reserves() {
        assert_eq!(safe_file_name("con.txt"), "_con.txt");
    }

    #[test]
    fn shortens_an_endless_name_but_keeps_its_extension() {
        let name = safe_file_name(&format!("{}.pdf", "a".repeat(500)));
        assert!(name.chars().count() <= 120);
        assert!(name.ends_with("a.pdf"));
    }

    #[test]
    fn never_overwrites_what_is_already_there() {
        let dir = Path::new("/Downloads");
        let taken = [
            PathBuf::from("/Downloads/Blatt.pdf"),
            PathBuf::from("/Downloads/Blatt (1).pdf"),
        ];
        let path = free_path(dir, "Blatt.pdf", |path| taken.iter().any(|t| t == path));
        assert_eq!(path, PathBuf::from("/Downloads/Blatt (2).pdf"));
    }

    #[test]
    fn numbers_before_the_last_extension_only() {
        let path = free_path(Path::new("/D"), "notes.v2.pdf", |path| {
            path == Path::new("/D/notes.v2.pdf")
        });
        assert_eq!(path, PathBuf::from("/D/notes.v2 (1).pdf"));
    }

    #[test]
    fn opens_documents_but_not_programs() {
        assert!(is_openable(Path::new("/D/Skript.PDF")));
        assert!(is_openable(Path::new("/D/Aufgabe.docx")));
        assert!(!is_openable(Path::new("/D/setup.exe")));
        assert!(!is_openable(Path::new("/D/run.command")));
        assert!(!is_openable(Path::new("/D/page.html")));
        assert!(!is_openable(Path::new("/D/no-extension")));
    }

    /// macOS reports the end of a download by URL only, without the path.
    #[test]
    fn finds_a_download_again_by_its_url() {
        let mut book = Book::default();
        let started = book.start(
            "https://ilias.example/file.pdf".into(),
            "/D/file.pdf".into(),
        );
        assert_eq!(started.state, State::Started);
        assert_eq!(started.file_name, "file.pdf");

        let finished = book.finish("https://ilias.example/file.pdf", true).unwrap();
        assert_eq!(finished.id, started.id);
        assert_eq!(finished.state, State::Finished);
        assert_eq!(book.saved(started.id), Some(Path::new("/D/file.pdf")));
    }

    #[test]
    fn ends_the_same_file_twice_in_the_order_it_began() {
        let mut book = Book::default();
        let first = book.start("https://x/f".into(), "/D/f.pdf".into());
        let second = book.start("https://x/f".into(), "/D/f (1).pdf".into());
        assert_eq!(book.finish("https://x/f", true).unwrap().id, first.id);
        assert_eq!(book.finish("https://x/f", false).unwrap().id, second.id);
    }

    /// Only a file that arrived can be opened; a failed one may be half there.
    #[test]
    fn opens_nothing_that_failed_or_is_still_running() {
        let mut book = Book::default();
        let running = book.start("https://x/a".into(), "/D/a.pdf".into());
        assert_eq!(book.saved(running.id), None);
        book.finish("https://x/a", false);
        assert_eq!(book.saved(running.id), None);
    }

    /// Two downloads of the same name at once must not share a file.
    #[test]
    fn counts_a_running_download_as_taken() {
        let mut book = Book::default();
        book.start("https://x/a".into(), "/D/a.pdf".into());
        assert!(book.is_taken(Path::new("/D/a.pdf")));
        book.finish("https://x/a", true);
        assert!(!book.is_taken(Path::new("/D/a.pdf")));
    }

    #[test]
    fn forgets_old_downloads_but_never_a_running_one() {
        let mut book = Book::default();
        let running = book.start("https://x/running".into(), "/D/running.pdf".into());
        for n in 0..30 {
            book.start(format!("https://x/{n}"), format!("/D/{n}.pdf").into());
            book.finish(&format!("https://x/{n}"), true);
        }
        assert!(book.entries.len() <= 20);
        assert_eq!(
            book.finish("https://x/running", true).unwrap().id,
            running.id
        );
    }
}
