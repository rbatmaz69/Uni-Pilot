//! What a course's `ILIAS` folder remembers, and what the sync decides from it.
//!
//! The folder holds a hidden `.ilias-sync.json`. It says which course the
//! folder belongs to, and for every file Uni Pilot put there: which ILIAS file
//! it came from, which version, and how big and how old it was when it
//! arrived. From that the sync tells a file the student has not touched from
//! one they annotated, and a file they deleted from one that was never there.
//!
//! No network and no clock here: the sync reads ILIAS, this module decides,
//! and both halves are tested apart.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// The manifest's name. Hidden, so neither the explorer nor search list it.
pub const MANIFEST: &str = ".ilias-sync.json";
/// The folder inside the course folder that the sync owns.
pub const FOLDER: &str = "ILIAS";
/// Where courses go in the workspace.
pub const COURSES: &str = "Courses";
/// Longest name the sync writes, in characters, extension included.
const NAME_MAX: usize = 120;
const FORMAT: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: u32,
    /// The ILIAS host, e.g. `ilias.hs-heilbronn.de`. A folder belongs to one.
    pub installation: String,
    pub course_ref_id: String,
    pub course_title: String,
    /// Whether Uni Pilot syncs the course on its own, or only when asked.
    pub auto: bool,
    /// ILIAS folders the student switched off. Their files are left alone.
    #[serde(default)]
    pub excluded: Vec<String>,
    /// When the last full sync ended, RFC 3339.
    #[serde(default)]
    pub synced_at: Option<String>,
    /// ILIAS folders met so far, by ref_id: where each one went.
    #[serde(default)]
    pub folders: BTreeMap<String, TrackedFolder>,
    /// Files Uni Pilot put here, by ref_id.
    #[serde(default)]
    pub files: BTreeMap<String, Tracked>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedFolder {
    pub title: String,
    pub parent_ref_id: String,
    /// Relative to the `ILIAS` folder, `/`-separated.
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tracked {
    /// Relative to the `ILIAS` folder, `/`-separated.
    pub path: String,
    pub title: String,
    pub parent_ref_id: String,
    pub version: u32,
    pub updated_at: Option<String>,
    /// What ILIAS said the size was when the file came.
    pub ilias_size: Option<u64>,
    /// Size and modification time on disk right after the download, to tell
    /// an untouched file from one the student changed.
    pub local_size: u64,
    pub local_modified: u64,
    pub state: FileState,
    /// Arrived, or arrived in a new version, and not opened in Uni Pilot
    /// since: what the explorer counts as new. Files synced before this was
    /// remembered read as seen, so an update does not flag a whole semester.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub unseen: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileState {
    /// Here, and still on ILIAS.
    Synced,
    /// Here, but ILIAS no longer lists it. Kept: a lecturer taking the slides
    /// offline after the semester is exactly when the copy matters.
    Gone,
    /// The student deleted or moved it. Not brought back unasked.
    Removed,
}

impl Manifest {
    pub fn new(installation: &str, course_ref_id: &str, course_title: &str) -> Self {
        Manifest {
            format: FORMAT,
            installation: installation.to_string(),
            course_ref_id: course_ref_id.to_string(),
            course_title: course_title.to_string(),
            auto: false,
            excluded: Vec::new(),
            synced_at: None,
            folders: BTreeMap::new(),
            files: BTreeMap::new(),
        }
    }

    pub fn belongs_to(&self, installation: &str, course_ref_id: &str) -> bool {
        self.installation == installation && self.course_ref_id == course_ref_id
    }

    /// The tracked file at `path` (relative to the `ILIAS` folder), if any.
    pub fn file_at(&self, path: &str) -> Option<&Tracked> {
        self.files.values().find(|file| file.path == path)
    }
}

// --- reading and writing -----------------------------------------------------

/// The manifest in `dir`, when `dir` is a synced `ILIAS` folder. A manifest
/// that cannot be read counts as none: the folder is then an ordinary one.
pub fn read(dir: &Path) -> Option<Manifest> {
    let path = dir.join(MANIFEST);
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.is_file() || meta.len() > 16 * 1024 * 1024 {
        return None;
    }
    let manifest: Manifest = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    (manifest.format == FORMAT).then_some(manifest)
}

pub fn is_synced_folder(dir: &Path) -> bool {
    fs::symlink_metadata(dir.join(MANIFEST)).is_ok_and(|meta| meta.is_file())
}

/// Writes the manifest whole or not at all.
pub fn write(dir: &Path, manifest: &Manifest) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|error| error.to_string())?;
    let temp = dir.join(format!(".unipilot-manifest-{}", nanos()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temp, dir.join(MANIFEST))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|error| format!("The course folder could not be updated: {error}"))
}

/// Every synced folder in the workspace, `.trash` and hidden folders aside.
/// Synced folders are not searched further: they do not nest.
pub fn find_all(root: &Path) -> Vec<(PathBuf, Manifest)> {
    let mut found = Vec::new();
    let mut folders = vec![(root.to_path_buf(), 0usize)];
    while let Some((folder, depth)) = folders.pop() {
        if folder != root {
            if let Some(manifest) = read(&folder) {
                found.push((folder, manifest));
                continue;
            }
        }
        // Deep enough for Courses/<semester>/<course>/ILIAS wherever the
        // student moved it; not a walk through every note.
        if depth >= 8 {
            continue;
        }
        let Ok(items) = fs::read_dir(&folder) else {
            continue;
        };
        for item in items.flatten() {
            let name = item.file_name();
            let Ok(meta) = fs::symlink_metadata(item.path()) else {
                continue;
            };
            if name.to_string_lossy().starts_with('.') || !meta.is_dir() {
                continue;
            }
            folders.push((item.path(), depth + 1));
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

/// The synced folder `dir` is in, or is, up to (not including) `root`.
pub fn enclosing(root: &Path, dir: &Path) -> Option<(PathBuf, Manifest)> {
    let mut current = dir;
    while current != root && current.starts_with(root) {
        if let Some(manifest) = read(current) {
            return Some((current.to_path_buf(), manifest));
        }
        current = current.parent()?;
    }
    None
}

/// Files the sync brought into or below `dir` that are still unseen and still
/// there. A file the student deleted since is not counted before the next
/// sync notices.
pub fn unseen_below(root: &Path, dir: &Path) -> Vec<PathBuf> {
    let synced = match enclosing(root, dir) {
        Some(found) => vec![found],
        None => find_all(dir),
    };
    synced
        .iter()
        .flat_map(|(folder, manifest)| {
            manifest
                .files
                .values()
                .filter(|file| file.unseen && file.state != FileState::Removed)
                .map(|file| folder.join(&file.path))
        })
        .filter(|path| path.starts_with(dir) && path.is_file())
        .collect()
}

/// Marks the file at `target`, or everything below the folder at `target`,
/// as seen. Nothing to do outside a synced folder.
pub fn mark_seen(root: &Path, target: &Path) -> Result<(), String> {
    let dir = if target.is_dir() {
        target
    } else {
        target.parent().unwrap_or(root)
    };
    let Some((folder, mut manifest)) = enclosing(root, dir) else {
        return Ok(());
    };
    let Ok(inside) = target.strip_prefix(&folder) else {
        return Ok(());
    };
    let inside = inside
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    let mut changed = false;
    for file in manifest.files.values_mut() {
        let below = inside.is_empty()
            || file.path == inside
            || file.path.starts_with(&format!("{inside}/"));
        if file.unseen && below {
            file.unseen = false;
            changed = true;
        }
    }
    if changed {
        write(&folder, &manifest)?;
    }
    Ok(())
}

/// Whether `dir` is, or holds, a synced folder.
pub fn holds_synced_folder(dir: &Path) -> bool {
    if is_synced_folder(dir) {
        return true;
    }
    let Ok(items) = fs::read_dir(dir) else {
        return false;
    };
    items.flatten().any(|item| {
        fs::symlink_metadata(item.path()).is_ok_and(|meta| meta.is_dir())
            && !item.file_name().to_string_lossy().starts_with('.')
            && holds_synced_folder(&item.path())
    })
}

// --- names ---------------------------------------------------------------------

/// An ILIAS title as a file or folder name the workspace accepts: nothing a
/// file system refuses, not hidden, not endless, never empty.
pub fn local_name(title: &str) -> String {
    let title = title.replace(": ", " - ");
    let mapped: String = title
        .chars()
        .filter_map(|c| match c {
            '/' | '\\' | ':' | '|' => Some('-'),
            '"' => Some('\''),
            '*' | '?' | '<' | '>' => None,
            c if c.is_control() => Some(' '),
            c => Some(c),
        })
        .collect();
    let squashed = crate::ilias_sync::squash(&mapped);
    let trimmed = squashed.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let name = if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    };
    let reserved = matches!(
        stem(&name).to_ascii_uppercase().as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "LPT1" | "LPT2" | "LPT3"
    );
    let name = if reserved { format!("_{name}") } else { name };
    shorten(&name, NAME_MAX)
}

/// A file's name from its ILIAS title and suffix: `Kapitel 1` + `pdf` →
/// `Kapitel 1.pdf`; a title that already ends in its suffix keeps it once.
pub fn file_name(title: &str, suffix: Option<&str>) -> String {
    let base = local_name(title);
    let extension = suffix
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 10
                && value.chars().all(|c| c.is_ascii_alphanumeric())
        });
    match extension {
        Some(extension) if !base.to_lowercase().ends_with(&format!(".{extension}")) => {
            let room = NAME_MAX.saturating_sub(extension.len() + 1).max(1);
            let base = shorten(&base, room);
            format!("{}.{extension}", base.trim_end_matches(['.', ' ']))
        }
        _ => base,
    }
}

/// `Kapitel 1.pdf` → `Kapitel 1 (version 3).pdf`.
pub fn versioned_name(name: &str, version: u32) -> String {
    let (stem, extension) = split_extension(name);
    format!("{stem} (version {version}){extension}")
}

/// The first of `name`, `name 2`, `name 3` … free in `dir` and not in `taken`.
pub fn free_name(dir: &Path, name: &str, taken: &[String]) -> String {
    let free = |candidate: &str| {
        !taken.iter().any(|other| other == candidate)
            && fs::symlink_metadata(dir.join(candidate)).is_err()
    };
    if free(name) {
        return name.to_string();
    }
    let (stem, extension) = split_extension(name);
    (2..)
        .map(|n| format!("{stem} {n}{extension}"))
        .find(|candidate| free(candidate))
        .unwrap_or_else(|| name.to_string())
}

fn shorten(name: &str, max: usize) -> String {
    if name.chars().count() <= max {
        return name.to_string();
    }
    let (stem, extension) = split_extension(name);
    let room = max.saturating_sub(extension.chars().count()).max(1);
    let stem: String = stem.chars().take(room).collect();
    format!("{}{extension}", stem.trim_end())
}

fn stem(name: &str) -> &str {
    split_extension(name).0
}

fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(dot) if dot > 0 && name.len() - dot <= 11 => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    }
}

/// `Courses/<semester>/<course>` as the workspace path segments.
pub fn course_segments(semester: Option<&str>, course_title: &str) -> Vec<String> {
    let mut segments = vec![COURSES.to_string()];
    if let Some(semester) = semester.map(str::trim).filter(|value| !value.is_empty()) {
        segments.push(local_name(semester));
    }
    segments.push(local_name(course_title));
    segments
}

// --- deciding ------------------------------------------------------------------

/// A file as ILIAS lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct Listed {
    pub ref_id: String,
    pub parent_ref_id: String,
    pub title: String,
    pub suffix: Option<String>,
    pub size: Option<u64>,
    pub version: u32,
    pub updated_at: Option<String>,
}

/// How a tracked file looks on disk now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Disk {
    Missing,
    /// As it arrived.
    Untouched,
    /// Edited, annotated or replaced by the student.
    Changed,
}

pub fn disk_state(folder: &Path, tracked: &Tracked) -> Disk {
    match fs::symlink_metadata(folder.join(&tracked.path)) {
        Ok(meta) if meta.is_file() => {
            if meta.len() == tracked.local_size && modified_ms(&meta) == tracked.local_modified {
                Disk::Untouched
            } else {
                Disk::Changed
            }
        }
        _ => Disk::Missing,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plan {
    /// Up to date, or deliberately left alone.
    Nothing,
    /// New on ILIAS: download it.
    New,
    /// A newer version, and the old one untouched: replace it, old to Recently deleted.
    Replace,
    /// A newer version, but the student changed the old one: keep theirs and
    /// put the new one beside it.
    KeepBoth,
    /// Larger than the sync downloads on its own.
    TooLarge,
    /// The student deleted it: note that, and do not bring it back.
    MarkRemoved,
    /// Listed again after ILIAS had dropped it.
    Relisted,
}

pub fn plan(tracked: Option<&Tracked>, listed: &Listed, disk: Disk, max_bytes: u64) -> Plan {
    let too_large = listed.size.is_some_and(|size| size > max_bytes);
    let Some(tracked) = tracked else {
        return if too_large { Plan::TooLarge } else { Plan::New };
    };
    if tracked.state == FileState::Removed {
        return Plan::Nothing;
    }
    if disk == Disk::Missing {
        return Plan::MarkRemoved;
    }
    let newer = listed.version != tracked.version
        || (listed.updated_at.is_some()
            && tracked.updated_at.is_some()
            && listed.updated_at != tracked.updated_at);
    if newer {
        if too_large {
            return Plan::TooLarge;
        }
        return if disk == Disk::Untouched {
            Plan::Replace
        } else {
            Plan::KeepBoth
        };
    }
    if tracked.state == FileState::Gone {
        return Plan::Relisted;
    }
    Plan::Nothing
}

// --- time ----------------------------------------------------------------------

pub fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64)
        .unwrap_or(0)
}

pub fn nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Dir(PathBuf);
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    impl Dir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "unipilot-mirror-test-{}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            Dir(path)
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn listed(version: u32, size: u64) -> Listed {
        Listed {
            ref_id: "11".into(),
            parent_ref_id: "10".into(),
            title: "Blatt 1".into(),
            suffix: Some("pdf".into()),
            size: Some(size),
            version,
            updated_at: Some("2026-10-01T10:00".into()),
        }
    }

    fn tracked(version: u32, state: FileState) -> Tracked {
        Tracked {
            path: "Blatt 1.pdf".into(),
            title: "Blatt 1".into(),
            parent_ref_id: "10".into(),
            version,
            updated_at: Some("2026-10-01T10:00".into()),
            ilias_size: Some(100),
            local_size: 100,
            local_modified: 1,
            state,
            unseen: false,
        }
    }

    #[test]
    fn names_files_after_their_ilias_title() {
        assert_eq!(file_name("Kapitel 1", Some("pdf")), "Kapitel 1.pdf");
        assert_eq!(file_name("Kapitel 1.pdf", Some("PDF")), "Kapitel 1.pdf");
        assert_eq!(file_name("Notizen", None), "Notizen");
        assert_eq!(file_name("Blatt", Some("../x")), "Blatt");
    }

    #[test]
    fn keeps_names_the_workspace_accepts() {
        assert_eq!(
            local_name("Kapitel 1: Einführung"),
            "Kapitel 1 - Einführung"
        );
        assert_eq!(local_name("Übung 1/2"), "Übung 1-2");
        assert_eq!(local_name("Was ist KI?"), "Was ist KI");
        assert_eq!(local_name("..hidden."), "hidden");
        assert_eq!(local_name("  "), "Untitled");
        assert_eq!(local_name("CON"), "_CON");
        assert_eq!(local_name("a\tb\nc"), "a b c");
        let long = local_name(&"x".repeat(400));
        assert_eq!(long.chars().count(), NAME_MAX);
        let long_file = file_name(&"y".repeat(400), Some("pdf"));
        assert!(long_file.ends_with(".pdf") && long_file.chars().count() <= NAME_MAX);
    }

    #[test]
    fn names_a_new_version_beside_the_students_copy() {
        assert_eq!(versioned_name("Blatt 1.pdf", 3), "Blatt 1 (version 3).pdf");
        assert_eq!(versioned_name("Notizen", 2), "Notizen (version 2)");
    }

    #[test]
    fn places_a_course_under_its_semester() {
        assert_eq!(
            course_segments(Some("Winter 2026-27"), "Datenbanken 1"),
            vec!["Courses", "Winter 2026-27", "Datenbanken 1"]
        );
        assert_eq!(course_segments(None, "Logik"), vec!["Courses", "Logik"]);
        assert_eq!(course_segments(Some(" "), "A/B"), vec!["Courses", "A-B"]);
    }

    #[test]
    fn never_takes_a_name_that_is_used() {
        let dir = Dir::new();
        fs::write(dir.0.join("Folien.pdf"), "x").unwrap();
        assert_eq!(free_name(&dir.0, "Folien.pdf", &[]), "Folien 2.pdf");
        assert_eq!(
            free_name(&dir.0, "Folien.pdf", &["Folien 2.pdf".into()]),
            "Folien 3.pdf"
        );
        assert_eq!(free_name(&dir.0, "Neu.pdf", &[]), "Neu.pdf");
    }

    #[test]
    fn downloads_what_is_new_unless_it_is_huge() {
        assert_eq!(plan(None, &listed(1, 100), Disk::Missing, 1000), Plan::New);
        assert_eq!(
            plan(None, &listed(1, 5000), Disk::Missing, 1000),
            Plan::TooLarge
        );
    }

    #[test]
    fn replaces_an_untouched_file_and_keeps_a_changed_one() {
        let old = tracked(1, FileState::Synced);
        assert_eq!(
            plan(Some(&old), &listed(2, 100), Disk::Untouched, 1000),
            Plan::Replace
        );
        assert_eq!(
            plan(Some(&old), &listed(2, 100), Disk::Changed, 1000),
            Plan::KeepBoth
        );
        let mut reuploaded = listed(1, 100);
        reuploaded.updated_at = Some("2026-10-02T09:00".into());
        assert_eq!(
            plan(Some(&old), &reuploaded, Disk::Untouched, 1000),
            Plan::Replace
        );
    }

    #[test]
    fn leaves_up_to_date_and_edited_files_alone() {
        let old = tracked(1, FileState::Synced);
        assert_eq!(
            plan(Some(&old), &listed(1, 100), Disk::Untouched, 1000),
            Plan::Nothing
        );
        assert_eq!(
            plan(Some(&old), &listed(1, 100), Disk::Changed, 1000),
            Plan::Nothing
        );
    }

    #[test]
    fn does_not_bring_back_what_the_student_deleted() {
        let old = tracked(1, FileState::Synced);
        assert_eq!(
            plan(Some(&old), &listed(1, 100), Disk::Missing, 1000),
            Plan::MarkRemoved
        );
        let removed = tracked(1, FileState::Removed);
        assert_eq!(
            plan(Some(&removed), &listed(2, 100), Disk::Missing, 1000),
            Plan::Nothing
        );
    }

    #[test]
    fn notices_a_file_listed_again() {
        let gone = tracked(1, FileState::Gone);
        assert_eq!(
            plan(Some(&gone), &listed(1, 100), Disk::Untouched, 1000),
            Plan::Relisted
        );
    }

    #[test]
    fn tells_an_untouched_file_from_a_changed_one() {
        let dir = Dir::new();
        fs::write(dir.0.join("Blatt 1.pdf"), "0123456789").unwrap();
        let meta = fs::metadata(dir.0.join("Blatt 1.pdf")).unwrap();
        let mut file = tracked(1, FileState::Synced);
        file.local_size = 10;
        file.local_modified = modified_ms(&meta);
        assert_eq!(disk_state(&dir.0, &file), Disk::Untouched);
        file.local_size = 11;
        assert_eq!(disk_state(&dir.0, &file), Disk::Changed);
        file.path = "missing.pdf".into();
        assert_eq!(disk_state(&dir.0, &file), Disk::Missing);
    }

    #[test]
    fn finds_synced_folders_wherever_they_were_moved() {
        let dir = Dir::new();
        let first = dir.0.join("Courses/Winter 2026-27/Datenbanken/ILIAS");
        let moved = dir.0.join("Archiv/Logik/ILIAS");
        let trashed = dir.0.join(".trash/Alt/ILIAS");
        for folder in [&first, &moved, &trashed] {
            fs::create_dir_all(folder).unwrap();
        }
        write(&first, &Manifest::new("ilias.example", "1", "Datenbanken")).unwrap();
        write(&moved, &Manifest::new("ilias.example", "2", "Logik")).unwrap();
        write(&trashed, &Manifest::new("ilias.example", "3", "Alt")).unwrap();

        let found = find_all(&dir.0);
        let ids: Vec<&str> = found
            .iter()
            .map(|(_, m)| m.course_ref_id.as_str())
            .collect();
        assert_eq!(ids, vec!["2", "1"]);

        let inside = first.join("Folien");
        fs::create_dir_all(&inside).unwrap();
        assert_eq!(enclosing(&dir.0, &inside).unwrap().0, first);
        assert!(enclosing(&dir.0, &dir.0.join("Archiv")).is_none());
        assert!(holds_synced_folder(&dir.0.join("Archiv")));
        assert!(!holds_synced_folder(&inside));
    }

    #[test]
    fn a_broken_manifest_is_no_manifest() {
        let dir = Dir::new();
        fs::write(dir.0.join(MANIFEST), "{ not json").unwrap();
        assert!(read(&dir.0).is_none());
        assert!(is_synced_folder(&dir.0));
    }

    #[test]
    fn writes_the_manifest_whole() {
        let dir = Dir::new();
        let mut manifest = Manifest::new("ilias.example", "7", "Kurs");
        manifest
            .files
            .insert("11".into(), tracked(1, FileState::Synced));
        write(&dir.0, &manifest).unwrap();
        assert_eq!(read(&dir.0), Some(manifest.clone()));
        assert_eq!(manifest.file_at("Blatt 1.pdf").unwrap().version, 1);
        let leftovers = fs::read_dir(&dir.0)
            .unwrap()
            .flatten()
            .filter(|item| item.file_name() != MANIFEST)
            .count();
        assert_eq!(leftovers, 0);
    }
}
