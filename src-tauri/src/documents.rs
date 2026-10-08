//! Local document workspace. All caller paths are relative to Documents/Uni Pilot.
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

use crate::ilias_sync::mirror;

const MAX_FILE: usize = 25 * 1024 * 1024;
const MAX_TEXT: u64 = 2 * 1024 * 1024;
/// Images pasted into a note live next to it, the way Obsidian, Typora and
/// Zettlr store them, so the Markdown stays small and portable.
const ATTACHMENTS: &str = "attachments";
const IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"];
const UPLOAD_HEADER: &str = "x-uni-pilot-upload";
const MAX_SEARCH_RESULTS: usize = 40;
static WORKSPACE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Request {
    List {
        path: String,
    },
    Create {
        path: String,
        name: String,
        folder: bool,
    },
    Read {
        path: String,
    },
    ReadDrawing {
        path: String,
    },
    Preview {
        path: String,
    },
    Save {
        path: String,
        content: String,
        expected: String,
    },
    SaveDrawing {
        path: String,
        content: String,
    },
    Move {
        path: String,
        destination: String,
        name: String,
    },
    Trash {
        path: String,
    },
    Open {
        path: String,
    },
    Reveal {
        path: String,
    },
    Search {
        query: String,
    },
    /// The student opened a file from ILIAS, or asked to clear a folder's new files.
    Seen {
        path: String,
    },
    /// Every synced course with its files, for the ILIAS space.
    Ilias,
}

/// Describes the raw bytes sent to `document_upload`.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Upload {
    /// Copies a file into a folder under its own name. Never overwrites.
    Import { path: String, name: String },
    /// Stores an image or a PDF source snapshot attached to a note in the `attachments` folder beside it.
    Attachment { note: String, name: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    name: String,
    path: String,
    folder: bool,
    size: u64,
    modified: u64,
    /// What the entry is to the ILIAS course sync: `root` for a course's
    /// `ILIAS` folder, `folder` and `file` for what the sync put inside it,
    /// `gone` for a file ILIAS no longer lists.
    #[serde(skip_serializing_if = "Option::is_none")]
    ilias: Option<&'static str>,
    /// Files the ILIAS sync brought that are not opened yet: 1 on such a file,
    /// on a folder all of them below it.
    #[serde(skip_serializing_if = "is_zero")]
    unseen: usize,
}

fn is_zero(count: &usize) -> bool {
    *count == 0
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    #[serde(flatten)]
    entry: Entry,
    /// The first line of text that contains the query.
    snippet: Option<String>,
    matches: usize,
    name_match: bool,
}

fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn valid_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty()
        || name.starts_with('.')
        || name.ends_with('.')
        || name.ends_with(' ')
        || name.len() > 240
        || name
            .chars()
            .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
    {
        return Err(
            "Choose a name without a leading dot, trailing space, or special path characters."
                .into(),
        );
    }
    Ok(())
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_text(path: &Path) -> bool {
    ["txt", "md", "markdown"].contains(&extension(path).as_str())
}

// Reject symlinks in every component, including links into the workspace. This
// keeps opening a document from following an unexpected target outside it.
pub(crate) fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut result = root.to_path_buf();
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(name) => result.push(name),
            _ => return Err("Only paths inside your document workspace are allowed.".into()),
        }
        match fs::symlink_metadata(&result) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err(
                        "Symbolic links are not supported in the document workspace.".into(),
                    );
                }
            }
            Err(io_error) if io_error.kind() == io::ErrorKind::NotFound => {
                // A drawing sidecar may not exist yet. Existing callers still
                // surface a useful file-not-found error when they try to use it.
                if part != Path::new(relative).components().last().unwrap() {
                    return Err(io_error.to_string());
                }
            }
            Err(io_error) => return Err(error(io_error)),
        }
    }
    Ok(result)
}

fn mutable_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let resolved = resolve(root, path)?;
    if resolved == root || resolved == root.join(".trash") {
        return Err("The workspace and Recently deleted folders cannot be changed.".into());
    }
    Ok(resolved)
}

fn destination(root: &Path, path: &str, name: &str) -> Result<PathBuf, String> {
    valid_name(name)?;
    let parent = resolve(root, path)?;
    if !parent.is_dir() {
        return Err("Choose a destination folder.".into());
    }
    let target = parent.join(name);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("An item with this name already exists. Choose another name.".into());
    }
    Ok(target)
}

fn create_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    if let Err(e) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(path);
        return Err(e);
    }
    Ok(())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    create_file(path, bytes).map_err(error)
}

fn read_text(path: &Path) -> Result<String, String> {
    if !is_text(path) {
        return Err(
            "Open this file in its default app. Only Markdown and plain text can be edited here."
                .into(),
        );
    }
    let file = fs::File::open(path).map_err(error)?;
    let mut bytes = Vec::new();
    file.take(MAX_TEXT + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() as u64 > MAX_TEXT {
        return Err("This file is too large for the editor (maximum 2 MB).".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "This file is not UTF-8 text. Open it in its default app.".into())
}

fn read_drawing(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(error)?;
    let mut bytes = Vec::new();
    file.take(MAX_FILE as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > MAX_FILE {
        return Err("This drawing is too large (maximum 25 MB).".into());
    }
    String::from_utf8(bytes).map_err(|_| "This drawing file is not valid UTF-8.".into())
}

fn valid_drawing_path(path: &str) -> Result<(), String> {
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !name.starts_with('.') || !name.to_ascii_lowercase().ends_with(".excalidraw") {
        return Err("Drawing sidecars must be hidden .excalidraw files.".into());
    }
    Ok(())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_file_name(format!(".unipilot-save-{}", timestamp()?));
    write_new(&temp, bytes)?;
    let result = fs::rename(&temp, path).map_err(error);
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

fn timestamp() -> Result<u128, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error)?
        .as_nanos())
}

/// The hidden drawing that belongs to a note, e.g. `.Notes.md.excalidraw`.
fn drawing_sidecar(note: &Path) -> Option<PathBuf> {
    let name = note.file_name()?.to_str()?;
    Some(note.with_file_name(format!(".{name}.excalidraw")))
}

fn real_directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => Err(format!(
            "“{}” must be a regular folder.",
            path.file_name().unwrap_or_default().to_string_lossy()
        )),
        Ok(_) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(error(e)),
    }
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    if !real_directory(path)? {
        fs::create_dir(path).map_err(error)?;
    }
    Ok(())
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let hex = |offset: usize| {
            bytes
                .get(index + offset)
                .and_then(|b| (*b as char).to_digit(16))
        };
        match (bytes[index], hex(1), hex(2)) {
            (b'%', Some(high), Some(low)) => {
                decoded.push((high * 16 + low) as u8);
                index += 3;
            }
            (byte, _, _) => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).unwrap_or_else(|_| value.to_string())
}

/// File names inside `attachments/` that a note's Markdown links to.
fn referenced_attachments(markdown: &str) -> Vec<String> {
    let mut names = Vec::new();
    for (index, _) in markdown.match_indices("](") {
        let target = &markdown[index + 2..];
        // `<…>` destinations may contain spaces; bare ones end at whitespace.
        let bracketed = target.starts_with('<');
        let target = target.strip_prefix('<').unwrap_or(target);
        let target = target.strip_prefix("./").unwrap_or(target);
        let Some(rest) = target
            .strip_prefix(ATTACHMENTS)
            .and_then(|rest| rest.strip_prefix('/'))
        else {
            continue;
        };
        let end = rest
            .find(|c: char| {
                c == '\n'
                    || if bracketed {
                        c == '>'
                    } else {
                        c == ')' || c.is_whitespace()
                    }
            })
            .unwrap_or(rest.len());
        let name = percent_decode(&rest[..end]);
        if valid_name(&name).is_ok() && !names.contains(&name) {
            names.push(name);
        }
    }
    names
}

/// Keeps a note's companions with it after it moved from `from` to `to`: the
/// drawing sidecar moves along, and images it links to are copied into the
/// destination's `attachments` folder. Copying, not moving, because other notes
/// in the old folder may link to the same image.
fn follow_note(root: &Path, from: &Path, to: &Path) -> Result<(), String> {
    if !to.is_file() || !is_text(to) {
        return Ok(());
    }
    if let (Some(old), Some(new)) = (drawing_sidecar(from), drawing_sidecar(to)) {
        if fs::symlink_metadata(&old).is_ok_and(|meta| meta.is_file()) {
            if fs::symlink_metadata(&new).is_ok() {
                // A drawing left behind by an earlier note with this name: keep
                // it recoverable instead of overwriting it.
                let name = new.file_name().unwrap_or_default().to_string_lossy();
                let orphan = format!("{}-{}", timestamp()?, name.trim_start_matches('.'));
                fs::rename(&new, root.join(".trash").join(orphan)).map_err(error)?;
            }
            fs::rename(&old, &new).map_err(error)?;
        }
    }
    let (Some(old_folder), Some(new_folder)) = (from.parent(), to.parent()) else {
        return Ok(());
    };
    if old_folder == new_folder {
        return Ok(());
    }
    let source = old_folder.join(ATTACHMENTS);
    let target = new_folder.join(ATTACHMENTS);
    if !real_directory(&source)? {
        return Ok(());
    }
    for name in referenced_attachments(&read_text(to)?) {
        let file = source.join(&name);
        if !fs::symlink_metadata(&file).is_ok_and(|meta| meta.is_file())
            || fs::symlink_metadata(target.join(&name)).is_ok()
        {
            continue;
        }
        ensure_directory(&target)?;
        fs::copy(&file, target.join(&name)).map_err(error)?;
    }
    Ok(())
}

fn shell_open(path: &Path, reveal: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        if reveal {
            command.arg("-R");
        }
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("explorer.exe");
        if reveal {
            command.arg("/select,");
        }
        command.arg(path);
        command
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(if reveal && path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        });
        command
    };
    if command.status().map_err(error)?.success() {
        Ok(())
    } else {
        Err("The system could not open this item.".into())
    }
}

fn read_preview(path: &Path) -> Result<serde_json::Value, String> {
    let mime = match extension(path).as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "heic" => "image/heic",
        "heif" => "image/heif",
        _ => {
            return Err("Open this file in its default app. This format has no preview yet.".into())
        }
    };
    let file = fs::File::open(path).map_err(error)?;
    if !file.metadata().map_err(error)?.is_file() {
        return Err("Choose a file to preview.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > MAX_FILE {
        return Err("Preview files up to 25 MB. Open larger files in their default app.".into());
    }
    Ok(serde_json::json!({
        "mime": mime,
        "base64": base64::engine::general_purpose::STANDARD.encode(bytes),
    }))
}

fn entry(name: String, path: String, meta: &fs::Metadata) -> Entry {
    Entry {
        name,
        path,
        folder: meta.is_dir(),
        size: meta.len(),
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        ilias: None,
        unseen: 0,
    }
}

/// Counts on every entry what the ILIAS sync brought and nobody opened yet.
fn count_unseen(root: &Path, directory: &Path, entries: &mut [Entry]) {
    let unseen = mirror::unseen_below(root, directory);
    if unseen.is_empty() {
        return;
    }
    for entry in entries.iter_mut() {
        let path = directory.join(&entry.name);
        entry.unseen = if entry.folder {
            unseen.iter().filter(|file| file.starts_with(&path)).count()
        } else {
            usize::from(unseen.contains(&path))
        };
    }
}

/// Refused for a course's `ILIAS` folder: the sync finds its files by it.
const SYNCED_FOLDER: &str =
    "This folder is kept in sync with ILIAS. Stop syncing the course in Courses to change it.";
/// Refused for a folder holding one: it would take the synced files along.
const HOLDS_SYNCED_FOLDER: &str =
    "This folder holds a course kept in sync with ILIAS. Stop syncing the course in Courses first.";

/// Marks what the ILIAS course sync put in `directory`, and describes the
/// synced folder the listing is in, if any.
fn mark_synced(root: &Path, directory: &Path, entries: &mut [Entry]) -> serde_json::Value {
    let Some((folder, manifest)) = mirror::enclosing(root, directory) else {
        for entry in entries.iter_mut() {
            if entry.folder && mirror::is_synced_folder(&directory.join(&entry.name)) {
                entry.ilias = Some("root");
            }
        }
        return serde_json::Value::Null;
    };
    let inside = directory
        .strip_prefix(&folder)
        .map(|rest| {
            rest.components()
                .map(|part| part.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default();
    for entry in entries.iter_mut() {
        entry.ilias = if entry.folder {
            Some("folder")
        } else {
            let path = if inside.is_empty() {
                entry.name.clone()
            } else {
                format!("{inside}/{}", entry.name)
            };
            match manifest.file_at(&path).map(|file| file.state) {
                Some(mirror::FileState::Synced) => Some("file"),
                Some(mirror::FileState::Gone) => Some("gone"),
                _ => None,
            }
        };
    }
    let relative = folder
        .strip_prefix(root)
        .map(|rest| {
            rest.components()
                .map(|part| part.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default();
    serde_json::json!({
        "courseRefId": manifest.course_ref_id,
        "courseTitle": manifest.course_title,
        "root": relative,
        "syncedAt": manifest.synced_at,
        "auto": manifest.auto,
    })
}

/// Counts case-insensitive matches and keeps the first matching line.
fn content_matches(path: &Path, needle: &str) -> (usize, Option<String>) {
    let Ok(text) = read_text(path) else {
        return (0, None);
    };
    let mut count = 0;
    let mut snippet = None;
    for line in text.lines() {
        let lower = line.to_lowercase();
        let found = lower.matches(needle).count();
        if found == 0 {
            continue;
        }
        count += found;
        if snippet.is_none() {
            // Char offsets: lowercasing rarely changes lengths, and a slightly
            // shifted window is harmless for a preview line.
            let start = lower[..lower.find(needle).unwrap_or(0)].chars().count();
            // Show the words, not the Markdown markers in front of them.
            let text = line.trim_start_matches(|c: char| c.is_whitespace() || "#>-*+".contains(c));
            let text = ["[ ] ", "[x] ", "[X] "]
                .iter()
                .find_map(|task| text.strip_prefix(task))
                .unwrap_or(text);
            let chars: Vec<char> = text.chars().collect();
            let offset = line.chars().count() - chars.len();
            let from = start.saturating_sub(offset).saturating_sub(60);
            let to = (from + 160).min(chars.len());
            let mut text: String = chars[from.min(to)..to].iter().collect();
            if from > 0 {
                text.insert(0, '…');
            }
            if to < chars.len() {
                text.push('…');
            }
            snippet = Some(text);
        }
    }
    (count, snippet)
}

/// Finds files and folders by name, and notes by their text, across the workspace.
fn search(root: &Path, query: &str) -> Result<serde_json::Value, String> {
    let needle = query.trim().to_lowercase();
    if needle.chars().count() < 2 {
        return Ok(serde_json::json!([]));
    }
    let mut hits = Vec::new();
    let mut folders = vec![(root.to_path_buf(), String::new())];
    while let Some((folder, relative)) = folders.pop() {
        for item in fs::read_dir(&folder).map_err(error)? {
            let item = item.map_err(error)?;
            let name = item.file_name().to_string_lossy().into_owned();
            let meta = fs::symlink_metadata(item.path()).map_err(error)?;
            // Hidden names cover Recently deleted and drawing sidecars.
            if name.starts_with('.') || meta.file_type().is_symlink() {
                continue;
            }
            let path = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            if meta.is_dir() {
                folders.push((item.path(), path.clone()));
            }
            let name_match = name.to_lowercase().contains(&needle);
            let (matches, snippet) = if meta.is_file() && is_text(&item.path()) {
                content_matches(&item.path(), &needle)
            } else {
                (0, None)
            };
            if name_match || matches > 0 {
                hits.push(SearchHit {
                    entry: entry(name, path, &meta),
                    snippet,
                    matches,
                    name_match,
                });
            }
        }
    }
    hits.sort_by(|a, b| {
        b.name_match
            .cmp(&a.name_match)
            .then(b.matches.cmp(&a.matches))
            .then(b.entry.modified.cmp(&a.entry.modified))
    });
    hits.truncate(MAX_SEARCH_RESULTS);
    Ok(serde_json::json!(hits))
}

fn perform(root: &Path, request: Request) -> Result<serde_json::Value, String> {
    match request {
        Request::List { path } => {
            let directory = resolve(root, &path)?;
            let mut entries = Vec::new();
            for item in fs::read_dir(&directory).map_err(error)? {
                let item = item.map_err(error)?;
                let name = item.file_name().to_string_lossy().into_owned();
                let meta = fs::symlink_metadata(item.path()).map_err(error)?;
                if name.starts_with('.')
                    || meta.file_type().is_symlink()
                    || !(meta.is_file() || meta.is_dir())
                {
                    continue;
                }
                let path = if path.is_empty() {
                    name.clone()
                } else {
                    format!("{path}/{name}")
                };
                entries.push(entry(name, path, &meta));
            }
            let ilias = mark_synced(root, &directory, &mut entries);
            count_unseen(root, &directory, &mut entries);
            Ok(serde_json::json!({
                "root": root.to_string_lossy(),
                "entries": entries,
                "ilias": ilias,
            }))
        }
        Request::Create { path, name, folder } => {
            let target = destination(root, &path, &name)?;
            if folder {
                fs::create_dir(target).map_err(error)?;
            } else {
                if !name.to_lowercase().ends_with(".md") && !name.to_lowercase().ends_with(".txt") {
                    return Err("New documents need a .md or .txt extension.".into());
                }
                write_new(&target, b"")?;
            }
            Ok(serde_json::Value::Null)
        }
        Request::Read { path } => Ok(serde_json::json!(read_text(&resolve(root, &path)?)?)),
        Request::ReadDrawing { path } => {
            valid_drawing_path(&path)?;
            Ok(serde_json::json!(read_drawing(&resolve(root, &path)?)?))
        }
        Request::Preview { path } => read_preview(&resolve(root, &path)?),
        Request::Save {
            path,
            content,
            expected,
        } => {
            let target = mutable_path(root, &path)?;
            if content.len() as u64 > MAX_TEXT {
                return Err("Documents can contain up to 2 MB of text.".into());
            }
            let disk = read_text(&target)?;
            if disk != expected {
                // Another app changed the file since it was opened. Hand its
                // version back so the user can choose instead of losing either.
                return Ok(serde_json::json!({ "status": "conflict", "disk": disk }));
            }
            write_atomic(&target, content.as_bytes())?;
            Ok(serde_json::json!({ "status": "saved" }))
        }
        Request::SaveDrawing { path, content } => {
            valid_drawing_path(&path)?;
            let target = mutable_path(root, &path)?;
            if content.len() > MAX_FILE {
                return Err("Drawings can contain up to 25 MB of data.".into());
            }
            write_atomic(&target, content.as_bytes())?;
            Ok(serde_json::Value::Null)
        }
        Request::Move {
            path,
            destination: parent,
            name,
        } => {
            let source = mutable_path(root, &path)?;
            let target = destination(root, &parent, &name)?;
            if target.starts_with(&source) {
                return Err("A folder cannot be moved into itself.".into());
            }
            if mirror::is_synced_folder(&source) {
                return Err(SYNCED_FOLDER.into());
            }
            // A course folder may move anywhere the sync still finds it: not
            // into Recently deleted, and not into another course's files.
            if mirror::holds_synced_folder(&source)
                && (target.starts_with(root.join(".trash"))
                    || mirror::enclosing(root, target.parent().unwrap_or(root)).is_some())
            {
                return Err(HOLDS_SYNCED_FOLDER.into());
            }
            fs::rename(&source, &target).map_err(error)?;
            follow_note(root, &source, &target)?;
            Ok(serde_json::Value::Null)
        }
        Request::Trash { path } => {
            let source = mutable_path(root, &path)?;
            if mirror::is_synced_folder(&source) {
                return Err(SYNCED_FOLDER.into());
            }
            if mirror::holds_synced_folder(&source) {
                return Err(HOLDS_SYNCED_FOLDER.into());
            }
            let name = source
                .file_name()
                .ok_or("Missing file name")?
                .to_string_lossy()
                .into_owned();
            let mut target = root.join(".trash").join(&name);
            if fs::symlink_metadata(&target).is_ok() {
                target = root.join(".trash").join(format!("{}-{name}", timestamp()?));
            }
            fs::rename(&source, &target).map_err(error)?;
            follow_note(root, &source, &target)?;
            Ok(serde_json::Value::Null)
        }
        Request::Open { path } => {
            shell_open(&resolve(root, &path)?, false)?;
            Ok(serde_json::Value::Null)
        }
        Request::Reveal { path } => {
            shell_open(&resolve(root, &path)?, true)?;
            Ok(serde_json::Value::Null)
        }
        Request::Search { query } => search(root, &query),
        Request::Seen { path } => {
            mirror::mark_seen(root, &resolve(root, &path)?)?;
            Ok(serde_json::Value::Null)
        }
        Request::Ilias => Ok(serde_json::json!(mirror::courses(root))),
    }
}

fn perform_upload(root: &Path, upload: Upload, bytes: &[u8]) -> Result<serde_json::Value, String> {
    if bytes.len() > MAX_FILE {
        return Err("Files can be up to 25 MB each.".into());
    }
    match upload {
        Upload::Import { path, name } => {
            write_new(&destination(root, &path, &name)?, bytes)?;
            Ok(serde_json::Value::Null)
        }
        Upload::Attachment { note, name } => {
            valid_name(&name)?;
            let note = resolve(root, &note)?;
            if !note.is_file() || !is_text(&note) {
                return Err("Images can only be added to a Markdown or text note.".into());
            }
            if extension(Path::new(&name)) != "pdf"
                && !IMAGE_EXTENSIONS.contains(&extension(Path::new(&name)).as_str())
            {
                return Err("Only images and PDFs can be attached to a note.".into());
            }
            let folder = note
                .parent()
                .ok_or("Missing note folder")?
                .join(ATTACHMENTS);
            ensure_directory(&folder)?;
            let path = Path::new(&name);
            let stem = path.file_stem().unwrap_or_default().to_string_lossy();
            let extension = extension(path);
            for attempt in 1..1000 {
                let candidate = if attempt == 1 {
                    name.clone()
                } else {
                    format!("{stem}-{attempt}.{extension}")
                };
                match create_file(&folder.join(&candidate), bytes) {
                    Ok(()) => {
                        return Ok(
                            serde_json::json!({ "src": format!("{ATTACHMENTS}/{candidate}") }),
                        )
                    }
                    Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                    Err(e) => return Err(error(e)),
                }
            }
            Err("Could not find a free name for this image.".into())
        }
    }
}

pub(crate) async fn with_workspace<T: Send + 'static>(
    app: tauri::AppHandle,
    task: impl FnOnce(&Path) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = WORKSPACE_LOCK.lock().map_err(error)?;
        let root = app.path().document_dir().map_err(error)?.join("Uni Pilot");
        fs::create_dir_all(&root).map_err(error)?;
        if fs::symlink_metadata(&root)
            .map_err(error)?
            .file_type()
            .is_symlink()
        {
            return Err(
                "The Uni Pilot workspace must be a real folder, not a symbolic link.".into(),
            );
        }
        let root = root.canonicalize().map_err(error)?;
        let trash = root.join(".trash");
        if !trash.exists() {
            fs::create_dir(&trash).map_err(error)?;
        }
        resolve(&root, ".trash")?;
        task(&root)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub async fn document_request(
    app: tauri::AppHandle,
    request: Request,
) -> Result<serde_json::Value, String> {
    with_workspace(app, move |root| perform(root, request)).await
}

/// Copies a workspace file to Downloads without replacing a previous copy.
#[tauri::command]
pub async fn download_document(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let downloads = app.path().download_dir().map_err(error)?;
    with_workspace(app, move |root| copy_to_downloads(root, &downloads, &path)).await
}

fn copy_to_downloads(root: &Path, downloads: &Path, path: &str) -> Result<String, String> {
    let source = resolve(root, path)?;
    if !source.is_file() {
        return Err("Choose a file to download.".into());
    }
    let name = source
        .file_name()
        .ok_or("Missing file name")?
        .to_string_lossy();
    let stem = source
        .file_stem()
        .ok_or("Missing file name")?
        .to_string_lossy();
    let extension = source.extension().map(|value| value.to_string_lossy());
    for attempt in 1..1000 {
        let candidate = if attempt == 1 {
            name.to_string()
        } else if let Some(extension) = &extension {
            format!("{stem}-{attempt}.{extension}")
        } else {
            format!("{stem}-{attempt}")
        };
        let target = downloads.join(&candidate);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut output) => {
                let result = (|| -> io::Result<()> {
                    let mut input = fs::File::open(&source)?;
                    io::copy(&mut input, &mut output)?;
                    output.sync_all()
                })();
                if let Err(cause) = result {
                    let _ = fs::remove_file(&target);
                    return Err(error(cause));
                }
                return Ok(candidate);
            }
            Err(cause) if cause.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(cause) => return Err(error(cause)),
        }
    }
    Err("Could not find a free file name in Downloads.".into())
}

/// Receives file bytes as a raw IPC body rather than a JSON array of numbers,
/// which costs several bytes of JSON per byte of file. The upload's details
/// travel base64-encoded in a header, since file names may not be ASCII.
#[tauri::command]
pub async fn document_upload(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<serde_json::Value, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        // Platforms without the custom IPC protocol deliver the body as JSON.
        tauri::ipc::InvokeBody::Json(value) => {
            serde_json::from_value(value.clone()).map_err(|_| "Upload bytes are missing.")?
        }
    };
    let header = request
        .headers()
        .get(UPLOAD_HEADER)
        .ok_or("Upload details are missing.")?
        .to_str()
        .map_err(error)?;
    let details = base64::engine::general_purpose::STANDARD
        .decode(header)
        .map_err(error)?;
    let upload: Upload = serde_json::from_slice(&details).map_err(error)?;
    with_workspace(app, move |root| perform_upload(root, upload, &bytes)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Workspace(PathBuf);
    // Tests run in parallel and the clock may only tick in microseconds, so a
    // counter keeps every workspace directory distinct.
    static NEXT_WORKSPACE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    impl Workspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "unipilot-documents-test-{}-{}-{}",
                std::process::id(),
                NEXT_WORKSPACE.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                timestamp().unwrap()
            ));
            fs::create_dir_all(path.join(".trash")).unwrap();
            Self(path)
        }
        fn run(&self, request: Request) -> Result<serde_json::Value, String> {
            perform(&self.0, request)
        }
        fn upload(&self, upload: Upload, bytes: &[u8]) -> Result<serde_json::Value, String> {
            perform_upload(&self.0, upload, bytes)
        }
        fn import(
            &self,
            path: &str,
            name: &str,
            bytes: &[u8],
        ) -> Result<serde_json::Value, String> {
            self.upload(
                Upload::Import {
                    path: path.into(),
                    name: name.into(),
                },
                bytes,
            )
        }
        fn write(&self, path: &str, content: &str) {
            fs::write(self.0.join(path), content).unwrap();
        }
        fn exists(&self, path: &str) -> bool {
            self.0.join(path).exists()
        }
        fn mv(&self, path: &str, destination: &str, name: &str) {
            self.run(Request::Move {
                path: path.into(),
                destination: destination.into(),
                name: name.into(),
            })
            .unwrap();
        }
    }
    impl Drop for Workspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn download_keeps_existing_file_and_uses_a_free_name() {
        let workspace = Workspace::new();
        let downloads = workspace.0.join("downloads");
        fs::create_dir(&downloads).unwrap();
        workspace.write("Blatt.pdf", "new copy");
        fs::write(downloads.join("Blatt.pdf"), "old copy").unwrap();

        let name = copy_to_downloads(&workspace.0, &downloads, "Blatt.pdf").unwrap();
        assert_eq!(name, "Blatt-2.pdf");
        assert_eq!(
            fs::read_to_string(downloads.join("Blatt.pdf")).unwrap(),
            "old copy"
        );
        assert_eq!(
            fs::read_to_string(downloads.join(name)).unwrap(),
            "new copy"
        );
    }

    #[test]
    fn documents_persist_and_can_be_moved_trashed_and_restored() {
        let workspace = Workspace::new();
        workspace
            .run(Request::Create {
                path: "".into(),
                name: "Biology".into(),
                folder: true,
            })
            .unwrap();
        workspace
            .run(Request::Create {
                path: "Biology".into(),
                name: "Notes.md".into(),
                folder: false,
            })
            .unwrap();
        let saved = workspace
            .run(Request::Save {
                path: "Biology/Notes.md".into(),
                content: "# Lecture 1\nMitosis".into(),
                expected: "".into(),
            })
            .unwrap();
        assert_eq!(saved["status"], "saved");
        assert_eq!(
            fs::read_to_string(workspace.0.join("Biology/Notes.md")).unwrap(),
            "# Lecture 1\nMitosis"
        );
        workspace.mv("Biology/Notes.md", "", "Lecture.md");
        workspace
            .run(Request::Trash {
                path: "Lecture.md".into(),
            })
            .unwrap();
        assert!(!workspace.exists("Lecture.md"));
        assert!(workspace.exists(".trash/Lecture.md"));
        workspace.mv(".trash/Lecture.md", "Biology", "Lecture.md");
        assert_eq!(
            workspace
                .run(Request::Read {
                    path: "Biology/Lecture.md".into()
                })
                .unwrap(),
            "# Lecture 1\nMitosis"
        );
    }

    #[test]
    fn refuses_overwrites_and_reports_external_edit_conflicts() {
        let workspace = Workspace::new();
        workspace.import("", "Notes.txt", b"original").unwrap();
        assert!(workspace.import("", "Notes.txt", b"replacement").is_err());
        let conflict = workspace
            .run(Request::Save {
                path: "Notes.txt".into(),
                content: "new".into(),
                expected: "stale".into(),
            })
            .unwrap();
        assert_eq!(conflict["status"], "conflict");
        assert_eq!(conflict["disk"], "original");
        workspace
            .run(Request::Create {
                path: "".into(),
                name: "Other.txt".into(),
                folder: false,
            })
            .unwrap();
        assert!(workspace
            .run(Request::Move {
                path: "Other.txt".into(),
                destination: "".into(),
                name: "Notes.txt".into()
            })
            .is_err());
        assert_eq!(
            fs::read_to_string(workspace.0.join("Notes.txt")).unwrap(),
            "original"
        );
    }

    #[test]
    fn rejects_unsafe_paths_and_protects_workspace_roots() {
        let workspace = Workspace::new();
        for path in ["..", "../outside", "/tmp", "./", "x/../../"] {
            assert!(resolve(&workspace.0, path).is_err());
        }
        for name in ["", ".", "..", ".trash", "a/b", "a\\b", "notes.", "a\n"] {
            assert!(destination(&workspace.0, "", name).is_err());
        }
        for path in ["", ".trash"] {
            assert!(workspace.run(Request::Trash { path: path.into() }).is_err());
        }
        workspace
            .run(Request::Create {
                path: "".into(),
                name: "Course".into(),
                folder: true,
            })
            .unwrap();
        assert!(workspace
            .run(Request::Move {
                path: "Course".into(),
                destination: "Course".into(),
                name: "Nested".into()
            })
            .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_and_omits_them_from_listing() {
        let workspace = Workspace::new();
        std::os::unix::fs::symlink(std::env::temp_dir(), workspace.0.join("Outside")).unwrap();
        assert!(resolve(&workspace.0, "Outside").is_err());
        assert!(resolve(&workspace.0, "Outside/file.txt").is_err());
        let listing = workspace.run(Request::List { path: "".into() }).unwrap();
        assert_eq!(listing["entries"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn previews_binary_files_in_folders_without_changing_their_bytes() {
        let workspace = Workspace::new();
        fs::create_dir(workspace.0.join("Biology")).unwrap();
        for (name, mime) in [
            ("Slides.PDF", "application/pdf"),
            ("Diagram.png", "image/png"),
            ("Photo.jpeg", "image/jpeg"),
        ] {
            let bytes = vec![0, 255, 3, 127];
            fs::write(workspace.0.join("Biology").join(name), &bytes).unwrap();
            let preview = workspace
                .run(Request::Preview {
                    path: format!("Biology/{name}"),
                })
                .unwrap();
            assert_eq!(preview["mime"], mime);
            assert_eq!(
                base64::engine::general_purpose::STANDARD
                    .decode(preview["base64"].as_str().unwrap())
                    .unwrap(),
                bytes
            );
        }
    }

    #[test]
    fn preview_rejects_unsupported_large_and_unsafe_files() {
        let workspace = Workspace::new();
        fs::write(workspace.0.join("Page.html"), "<script></script>").unwrap();
        fs::File::create(workspace.0.join("Large.pdf"))
            .unwrap()
            .set_len(MAX_FILE as u64 + 1)
            .unwrap();
        fs::create_dir(workspace.0.join("Folder.png")).unwrap();
        for path in [
            "Page.html",
            "Large.pdf",
            "Folder.png",
            "../outside.pdf",
            "Missing.pdf",
        ] {
            assert!(workspace
                .run(Request::Preview { path: path.into() })
                .is_err());
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(workspace.0.join("Large.pdf"), workspace.0.join("Link.pdf"))
                .unwrap();
            assert!(workspace
                .run(Request::Preview {
                    path: "Link.pdf".into()
                })
                .is_err());
        }
    }

    #[test]
    fn binary_import_is_lossless_and_trash_collisions_preserve_both_files() {
        let workspace = Workspace::new();
        let bytes = vec![0, 255, 3, 127];
        workspace.import("", "Slides.pdf", &bytes).unwrap();
        assert_eq!(fs::read(workspace.0.join("Slides.pdf")).unwrap(), bytes);
        assert!(workspace
            .run(Request::Read {
                path: "Slides.pdf".into()
            })
            .is_err());
        workspace
            .run(Request::Trash {
                path: "Slides.pdf".into(),
            })
            .unwrap();
        workspace.import("", "Slides.pdf", &[4]).unwrap();
        workspace
            .run(Request::Trash {
                path: "Slides.pdf".into(),
            })
            .unwrap();
        let listing = workspace
            .run(Request::List {
                path: ".trash".into(),
            })
            .unwrap();
        assert_eq!(listing["entries"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn drawings_persist_in_hidden_sidecars_without_appearing_in_listing() {
        let workspace = Workspace::new();
        workspace
            .run(Request::Create {
                path: "".into(),
                name: "Notes.md".into(),
                folder: false,
            })
            .unwrap();
        let drawing = r#"{"elements":[],"appState":{},"files":{}}"#;
        workspace
            .run(Request::SaveDrawing {
                path: ".Notes.md.excalidraw".into(),
                content: drawing.into(),
            })
            .unwrap();
        assert_eq!(
            fs::read_to_string(workspace.0.join(".Notes.md.excalidraw")).unwrap(),
            drawing
        );
        assert_eq!(
            workspace
                .run(Request::ReadDrawing {
                    path: ".Notes.md.excalidraw".into()
                })
                .unwrap(),
            drawing
        );
        let listing = workspace.run(Request::List { path: "".into() }).unwrap();
        assert_eq!(listing["entries"].as_array().unwrap().len(), 1);
        assert!(workspace
            .run(Request::SaveDrawing {
                path: "Notes.md.excalidraw".into(),
                content: drawing.into(),
            })
            .is_err());
    }

    #[test]
    fn drawings_follow_their_note_through_rename_move_trash_and_restore() {
        let workspace = Workspace::new();
        fs::create_dir(workspace.0.join("Biology")).unwrap();
        workspace.write("Notes.md", "# Cells");
        workspace.write(".Notes.md.excalidraw", "sketch");
        workspace.mv("Notes.md", "", "Cells.md");
        assert_eq!(
            fs::read_to_string(workspace.0.join(".Cells.md.excalidraw")).unwrap(),
            "sketch"
        );
        workspace.mv("Cells.md", "Biology", "Cells.md");
        assert!(workspace.exists("Biology/.Cells.md.excalidraw"));
        workspace
            .run(Request::Trash {
                path: "Biology/Cells.md".into(),
            })
            .unwrap();
        assert!(workspace.exists(".trash/.Cells.md.excalidraw"));
        workspace.mv(".trash/Cells.md", "", "Cells.md");
        assert_eq!(
            fs::read_to_string(workspace.0.join(".Cells.md.excalidraw")).unwrap(),
            "sketch"
        );
        assert!(!workspace.exists(".Notes.md.excalidraw"));
    }

    #[test]
    fn a_stale_drawing_at_the_destination_is_kept_recoverable() {
        let workspace = Workspace::new();
        workspace.write("Notes.md", "");
        workspace.write(".Notes.md.excalidraw", "current");
        workspace.write(".Cells.md.excalidraw", "left over");
        workspace.mv("Notes.md", "", "Cells.md");
        assert_eq!(
            fs::read_to_string(workspace.0.join(".Cells.md.excalidraw")).unwrap(),
            "current"
        );
        let trash = workspace
            .run(Request::List {
                path: ".trash".into(),
            })
            .unwrap();
        let entries = trash["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0]["name"]
            .as_str()
            .unwrap()
            .ends_with("Cells.md.excalidraw"));
    }

    #[test]
    fn pasted_images_get_unique_names_in_the_notes_attachments_folder() {
        let workspace = Workspace::new();
        fs::create_dir(workspace.0.join("Biology")).unwrap();
        workspace.write("Biology/Notes.md", "");
        let attach = |name: &str, bytes: &[u8]| {
            workspace.upload(
                Upload::Attachment {
                    note: "Biology/Notes.md".into(),
                    name: name.into(),
                },
                bytes,
            )
        };
        let first = attach("cell.png", &[1, 2, 3]).unwrap();
        let second = attach("cell.png", &[4]).unwrap();
        assert_eq!(first["src"], "attachments/cell.png");
        assert_eq!(second["src"], "attachments/cell-2.png");
        assert_eq!(
            fs::read(workspace.0.join("Biology/attachments/cell.png")).unwrap(),
            [1, 2, 3]
        );
        assert!(attach("script.js", b"x").is_err());
        assert!(attach("../escape.png", b"x").is_err());
        assert!(workspace
            .upload(
                Upload::Attachment {
                    note: "Biology".into(),
                    name: "cell.png".into(),
                },
                b"x",
            )
            .is_err());
    }

    #[test]
    fn pdf_snapshots_are_unique_and_follow_a_moved_markdown_note() {
        let workspace = Workspace::new();
        fs::create_dir(workspace.0.join("Lectures")).unwrap();
        fs::create_dir(workspace.0.join("Notes")).unwrap();
        workspace.write("Lectures/Slides.md", "");
        let first = workspace
            .upload(
                Upload::Attachment {
                    note: "Lectures/Slides.md".into(),
                    name: "original.pdf".into(),
                },
                b"%PDF-original",
            )
            .unwrap();
        let second = workspace
            .upload(
                Upload::Attachment {
                    note: "Lectures/Slides.md".into(),
                    name: "original.pdf".into(),
                },
                b"%PDF-new",
            )
            .unwrap();
        assert_eq!(first["src"], "attachments/original.pdf");
        assert_eq!(second["src"], "attachments/original-2.pdf");
        workspace.write(
            "Lectures/Slides.md",
            ":::pdfPage\n[Original](<attachments/original.pdf>)\n{}\n:::\n",
        );
        workspace
            .run(Request::Move {
                path: "Lectures/Slides.md".into(),
                destination: "Notes".into(),
                name: "Slides.md".into(),
            })
            .unwrap();
        assert_eq!(
            fs::read(workspace.0.join("Notes/attachments/original.pdf")).unwrap(),
            b"%PDF-original"
        );
        assert!(workspace.exists("Lectures/attachments/original.pdf"));
    }

    #[cfg(unix)]
    #[test]
    fn attachments_must_be_a_real_folder() {
        let workspace = Workspace::new();
        workspace.write("Notes.md", "");
        std::os::unix::fs::symlink(std::env::temp_dir(), workspace.0.join(ATTACHMENTS)).unwrap();
        assert!(workspace
            .upload(
                Upload::Attachment {
                    note: "Notes.md".into(),
                    name: "cell.png".into(),
                },
                b"x",
            )
            .is_err());
    }

    #[test]
    fn moving_a_note_brings_copies_of_the_images_it_links_to() {
        let workspace = Workspace::new();
        fs::create_dir_all(workspace.0.join("Biology/attachments")).unwrap();
        fs::create_dir(workspace.0.join("Chemistry")).unwrap();
        workspace.write("Biology/attachments/cell.png", "cell");
        workspace.write("Biology/attachments/shared diagram.png", "shared");
        workspace.write("Biology/attachments/unrelated.png", "other");
        workspace.write(
            "Biology/Notes.md",
            "![Cell](attachments/cell.png)\n![](<attachments/shared diagram.png>)\n![](attachments/missing.png)",
        );
        workspace.mv("Biology/Notes.md", "Biology", "Renamed.md");
        assert!(!workspace.exists("Chemistry/attachments"));
        workspace.mv("Biology/Renamed.md", "Chemistry", "Renamed.md");
        assert_eq!(
            fs::read_to_string(workspace.0.join("Chemistry/attachments/cell.png")).unwrap(),
            "cell"
        );
        assert!(workspace.exists("Chemistry/attachments/shared diagram.png"));
        assert!(!workspace.exists("Chemistry/attachments/unrelated.png"));
        // Other notes in the old folder may still use the originals.
        assert!(workspace.exists("Biology/attachments/cell.png"));
    }

    #[test]
    fn finds_attachment_links_in_markdown() {
        assert_eq!(
            referenced_attachments(
                "![a](attachments/a.png) ![b](./attachments/b%20c.png \"title\") \
                 ![c](<attachments/d e.png>) ![x](other/x.png) [doc](attachments/a.png) \
                 ![bad](attachments/../secret.png)"
            ),
            ["a.png", "b c.png", "d e.png"]
        );
    }

    #[test]
    fn search_finds_names_and_text_across_folders_but_not_deleted_items() {
        let workspace = Workspace::new();
        fs::create_dir(workspace.0.join("Biology")).unwrap();
        workspace.write(
            "Biology/Mitosis.md",
            "# Cell cycle\n\n- [ ] Prophase comes first.",
        );
        workspace.write(
            "Biology/Other.md",
            "Nothing here about it. Or prophase, twice: PROPHASE.",
        );
        workspace.write(".trash/Prophase.md", "prophase");
        workspace.write("Biology/.Mitosis.md.excalidraw", "prophase");
        let hits = workspace
            .run(Request::Search {
                query: "Prophase".into(),
            })
            .unwrap();
        let hits = hits.as_array().unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0]["path"], "Biology/Other.md");
        assert_eq!(hits[0]["matches"], 2);
        assert_eq!(hits[1]["snippet"], "Prophase comes first.");
        let by_name = workspace
            .run(Request::Search {
                query: "mitosis".into(),
            })
            .unwrap();
        assert_eq!(by_name[0]["path"], "Biology/Mitosis.md");
        assert_eq!(by_name[0]["nameMatch"], true);
        assert_eq!(
            workspace
                .run(Request::Search { query: "p".into() })
                .unwrap(),
            serde_json::json!([])
        );
    }

    /// A course folder as the ILIAS sync leaves it: `Courses/Kurs/ILIAS` with
    /// one synced file, one ILIAS no longer lists, and one of the student's.
    fn synced_course(workspace: &Workspace) {
        fs::create_dir_all(workspace.0.join("Courses/Kurs/ILIAS/Folien")).unwrap();
        workspace.write("Courses/Kurs/Notizen.md", "# Kurs");
        workspace.write("Courses/Kurs/ILIAS/Folien/Kapitel 1.pdf", "pdf");
        workspace.write("Courses/Kurs/ILIAS/Folien/Alt.pdf", "pdf");
        workspace.write("Courses/Kurs/ILIAS/Folien/Meins.pdf", "pdf");
        let file = |path: &str, state: &str| {
            serde_json::json!({
                "path": path, "title": path, "parentRefId": "10", "version": 1,
                "updatedAt": null, "iliasSize": 3, "localSize": 3, "localModified": 0,
                "state": state, "unseen": path == "Folien/Kapitel 1.pdf",
            })
        };
        let manifest = serde_json::json!({
            "format": 1,
            "installation": "ilias.example",
            "courseRefId": "7",
            "courseTitle": "Kurs",
            "auto": true,
            "syncedAt": "2026-10-01T08:00:00Z",
            "folders": { "10": { "title": "Folien", "parentRefId": "7", "path": "Folien" } },
            "files": {
                "11": file("Folien/Kapitel 1.pdf", "synced"),
                "12": file("Folien/Alt.pdf", "gone"),
            },
        });
        workspace.write(
            "Courses/Kurs/ILIAS/.ilias-sync.json",
            &serde_json::to_string(&manifest).unwrap(),
        );
    }

    fn marks(listing: &serde_json::Value) -> Vec<(String, serde_json::Value)> {
        listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                (
                    entry["name"].as_str().unwrap().to_string(),
                    entry
                        .get("ilias")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                )
            })
            .collect()
    }

    #[test]
    fn marks_what_the_ilias_sync_keeps() {
        let workspace = Workspace::new();
        synced_course(&workspace);

        let course = workspace
            .run(Request::List {
                path: "Courses/Kurs".into(),
            })
            .unwrap();
        let mut found = marks(&course);
        found.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            found,
            vec![
                ("ILIAS".into(), serde_json::json!("root")),
                ("Notizen.md".into(), serde_json::Value::Null),
            ]
        );
        assert_eq!(course["ilias"], serde_json::Value::Null);

        let folder = workspace
            .run(Request::List {
                path: "Courses/Kurs/ILIAS".into(),
            })
            .unwrap();
        assert_eq!(
            marks(&folder),
            vec![("Folien".into(), serde_json::json!("folder"))]
        );
        assert_eq!(
            folder["ilias"],
            serde_json::json!({
                "courseRefId": "7",
                "courseTitle": "Kurs",
                "root": "Courses/Kurs/ILIAS",
                "syncedAt": "2026-10-01T08:00:00Z",
                "auto": true,
            })
        );

        let mut files = marks(
            &workspace
                .run(Request::List {
                    path: "Courses/Kurs/ILIAS/Folien".into(),
                })
                .unwrap(),
        );
        files.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            files,
            vec![
                ("Alt.pdf".into(), serde_json::json!("gone")),
                ("Kapitel 1.pdf".into(), serde_json::json!("file")),
                ("Meins.pdf".into(), serde_json::Value::Null),
            ]
        );
    }

    fn unseen(listing: &serde_json::Value) -> Vec<(String, u64)> {
        let mut counts: Vec<_> = listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| {
                let count = entry.get("unseen")?.as_u64()?;
                Some((entry["name"].as_str().unwrap().to_string(), count))
            })
            .collect();
        counts.sort();
        counts
    }

    #[test]
    fn counts_new_ilias_files_on_every_folder_above_them_until_opened() {
        let workspace = Workspace::new();
        synced_course(&workspace);
        workspace.write("Courses/Kurs/ILIAS/Folien/Blatt 2.pdf", "pdf");
        let manifest = "Courses/Kurs/ILIAS/.ilias-sync.json";
        let mut value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(workspace.0.join(manifest)).unwrap()).unwrap();
        value["files"]["13"] = serde_json::json!({
            "path": "Folien/Blatt 2.pdf", "title": "Blatt 2", "parentRefId": "10",
            "version": 1, "updatedAt": null, "iliasSize": 3, "localSize": 3,
            "localModified": 0, "state": "synced", "unseen": true,
        });
        workspace.write(manifest, &value.to_string());
        let list = |path: &str| workspace.run(Request::List { path: path.into() }).unwrap();

        assert_eq!(unseen(&list("")), vec![("Courses".into(), 2)]);
        assert_eq!(unseen(&list("Courses/Kurs")), vec![("ILIAS".into(), 2)]);
        assert_eq!(
            unseen(&list("Courses/Kurs/ILIAS/Folien")),
            vec![("Blatt 2.pdf".into(), 1), ("Kapitel 1.pdf".into(), 1)]
        );

        workspace
            .run(Request::Seen {
                path: "Courses/Kurs/ILIAS/Folien/Kapitel 1.pdf".into(),
            })
            .unwrap();
        assert_eq!(unseen(&list("Courses")), vec![("Kurs".into(), 1)]);

        // A new file the student deleted before opening it is not counted.
        fs::remove_file(workspace.0.join("Courses/Kurs/ILIAS/Folien/Blatt 2.pdf")).unwrap();
        assert_eq!(unseen(&list("")), vec![]);

        // Outside a synced folder there is nothing to clear.
        workspace
            .run(Request::Seen {
                path: "Courses/Kurs/Notizen.md".into(),
            })
            .unwrap();
    }

    #[test]
    fn clears_every_new_file_below_a_folder_at_once() {
        let workspace = Workspace::new();
        synced_course(&workspace);
        workspace
            .run(Request::Seen {
                path: "Courses/Kurs/ILIAS".into(),
            })
            .unwrap();
        let listing = workspace
            .run(Request::List {
                path: "Courses/Kurs".into(),
            })
            .unwrap();
        assert_eq!(unseen(&listing), vec![]);
        // Seen leaves the rest of the manifest as it was.
        assert!(marks(&listing).contains(&("ILIAS".into(), serde_json::json!("root"))));
    }

    #[test]
    fn keeps_the_synced_folder_where_the_sync_finds_it() {
        let workspace = Workspace::new();
        synced_course(&workspace);
        fs::create_dir_all(workspace.0.join("Archiv")).unwrap();

        for request in [
            Request::Trash {
                path: "Courses/Kurs/ILIAS".into(),
            },
            Request::Move {
                path: "Courses/Kurs/ILIAS".into(),
                destination: "Courses/Kurs".into(),
                name: "Dateien".into(),
            },
        ] {
            assert!(workspace
                .run(request)
                .unwrap_err()
                .contains("kept in sync with ILIAS"));
        }
        assert!(workspace
            .run(Request::Trash {
                path: "Courses/Kurs".into(),
            })
            .unwrap_err()
            .contains("Stop syncing the course in Courses first"));
        assert!(workspace.exists("Courses/Kurs/ILIAS/.ilias-sync.json"));

        // What the sync put there, and the course folder itself, stay the student's.
        workspace
            .run(Request::Trash {
                path: "Courses/Kurs/ILIAS/Folien/Meins.pdf".into(),
            })
            .unwrap();
        workspace.mv("Courses/Kurs", "Archiv", "Kurs 2026");
        assert!(workspace.exists("Archiv/Kurs 2026/ILIAS/Folien/Kapitel 1.pdf"));
        assert!(workspace
            .run(Request::Move {
                path: "Archiv/Kurs 2026".into(),
                destination: ".trash".into(),
                name: "Kurs 2026".into(),
            })
            .unwrap_err()
            .contains("Stop syncing"));
    }
}
