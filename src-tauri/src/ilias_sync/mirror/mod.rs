//! A course's ILIAS files, kept in the student's Documents.
//!
//! Each course the student switches on gets a folder in the document
//! workspace, `Courses/<semester>/<course>/`, which is theirs: notes, drawings,
//! their own files. Inside it Uni Pilot keeps an `ILIAS` folder that mirrors
//! the course's folders and files. The student reads, annotates and searches
//! them like any other document; the sync only ever adds.
//!
//! The rules, each of which a test below or in `manifest.rs` holds:
//!
//! - One direction. ILIAS → this computer; nothing goes back.
//! - New files come; a file ILIAS replaced comes again, and the old one goes
//!   to Recently deleted — unless the student changed it, then both stay.
//! - Nothing is deleted here because ILIAS removed it. It is marked "no longer
//!   on ILIAS" and kept.
//! - A file the student deleted stays deleted.
//! - Files larger than `MAX_BYTES` are listed, not downloaded; one click in
//!   Courses fetches them.
//! - Folders the student switched off are not read at all.
//! - The `ILIAS` folder stays on this computer: out of iCloud Drive, so macOS
//!   never swaps its files for placeholders (`icloud.rs`).
//!
//! Downloading a file counts as reading it in ILIAS, as a click there would.
//! That is why the sync runs only for courses the student chose, and never
//! for all of them by default.
//!
//! Every read and download waits its turn behind the sync's pause
//! (`fetch::Pace`), so a first sync of a large course takes minutes, not
//! seconds, and ILIAS sees one polite visitor. Progress goes to the page as
//! `ilias-mirror-progress` events.

mod icloud;
mod manifest;

use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State, Url};

pub use manifest::FileState;
pub(crate) use manifest::{
    enclosing, holds_synced_folder, is_synced_folder, mark_seen, unseen_below, MANIFEST,
};
use manifest::{Disk, Listed, Manifest, Plan, Tracked, TrackedFolder};

use super::fetch::{self, Pace};
use super::links::{ref_id, Container, Page};
use super::{parse, today, SyncError};
use crate::documents::{resolve, with_workspace};
use crate::ilias_links::save;

/// Larger files are listed for the student to fetch, not downloaded unasked.
/// Lecture recordings run to hundreds of megabytes.
pub const MAX_BYTES: u64 = 100 * 1024 * 1024;
const PROGRESS_EVENT: &str = "ilias-mirror-progress";
/// Hidden, so an unfinished download never shows as a file.
const PARTIAL_PREFIX: &str = ".unipilot-download-";

/// What a sync meets when the student stopped the course while it ran.
const STOPPED: &str = "Syncing was stopped for this course.";

/// Courses being synced right now, by `installation/ref_id`.
static RUNNING: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Claims a course for one sync at a time; released when dropped.
struct Claim(String);

impl Claim {
    fn take(key: String) -> Result<Claim, SyncError> {
        let mut running = RUNNING
            .lock()
            .map_err(|_| SyncError::Local("The sync could not start.".into()))?;
        if running.contains(&key) {
            return Err(SyncError::Local(
                "This course is already being synced.".into(),
            ));
        }
        running.push(key.clone());
        Ok(Claim(key))
    }
}

impl Drop for Claim {
    fn drop(&mut self) {
        if let Ok(mut running) = RUNNING.lock() {
            running.retain(|key| key != &self.0);
        }
    }
}

// --- what the page sends and receives ----------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseRef {
    pub ref_id: String,
    pub container: Container,
    /// The name the course folder gets, e.g. "Datenbanken 1".
    pub title: String,
    /// The semester folder above it, e.g. "Winter 2026-27". None puts the
    /// course straight into `Courses/`.
    pub semester: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRef {
    pub ref_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRef {
    pub ref_id: String,
    pub title: String,
    pub suffix: Option<String>,
    pub size: Option<u64>,
    pub version: u32,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub course_ref_id: String,
    pub course_title: String,
    /// The `ILIAS` folder, relative to the workspace.
    pub root: String,
    pub auto: bool,
    pub excluded: Vec<String>,
    pub synced_at: Option<String>,
    pub folders: Vec<FolderSummary>,
    /// By ref_id.
    pub files: std::collections::BTreeMap<String, FileSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSummary {
    pub ref_id: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSummary {
    /// Relative to the workspace, for the document explorer.
    pub path: String,
    pub state: FileState,
    pub version: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skipped {
    pub ref_id: String,
    pub title: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failed {
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub summary: Summary,
    /// Workspace-relative paths of files that arrived.
    pub added: Vec<String>,
    /// Replaced by a newer version.
    pub updated: Vec<String>,
    /// A newer version arrived beside a copy the student had changed.
    pub kept: Vec<String>,
    pub too_large: Vec<Skipped>,
    /// Files ILIAS stopped listing this time.
    pub gone: u32,
    pub failed: Vec<Failed>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    course_ref_id: &'a str,
    /// `reading` the course's folders, then `downloading` files.
    phase: &'a str,
    done: usize,
    total: usize,
    title: Option<&'a str>,
}

fn tell(app: &tauri::AppHandle, progress: Progress<'_>) {
    let _ = app.emit(PROGRESS_EVENT, progress);
}

// --- the workspace side ------------------------------------------------------

/// The host a folder belongs to: `URL.host` in the page, port included when
/// it is not the default.
fn installation(base_url: &str) -> Result<String, SyncError> {
    let url = Url::parse(base_url.trim())
        .map_err(|_| SyncError::Refused("That is not an ILIAS address.".into()))?;
    let host = url
        .host_str()
        .ok_or_else(|| SyncError::Refused("That is not an ILIAS address.".into()))?;
    Ok(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    })
}

fn local(error: String) -> SyncError {
    SyncError::Local(error)
}

/// `root`-relative, `/`-separated, as the document explorer names paths.
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn join(dir: &str, name: &str) -> String {
    if dir.is_empty() {
        name.to_string()
    } else {
        format!("{dir}/{name}")
    }
}

/// A synced course as the ILIAS space in Documents shows it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CourseFiles {
    course_ref_id: String,
    title: String,
    /// The course's `ILIAS` folder, workspace-relative.
    root: String,
    synced_at: Option<String>,
    unseen: usize,
    files: Vec<CourseFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CourseFile {
    /// ILIAS file ref_id, for its original page and share link.
    ref_id: String,
    name: String,
    /// Workspace-relative, as the explorer opens it.
    path: String,
    size: u64,
    /// When ILIAS last changed the file, `YYYY-MM-DDTHH:MM`, if it said.
    updated_at: Option<String>,
    /// When it arrived here, in milliseconds since the epoch.
    arrived: u64,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    unseen: bool,
    /// ILIAS no longer lists it; the copy here stays.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    gone: bool,
}

/// Every synced course in the workspace, with the files the sync keeps there
/// that are still on disk. Read from the manifests alone: no network.
pub(crate) fn courses(root: &Path) -> Vec<CourseFiles> {
    manifest::find_all(root)
        .into_iter()
        .map(|(folder, manifest)| {
            icloud::keep_on_this_computer(&folder);
            let base = relative(root, &folder);
            let files: Vec<CourseFile> = manifest
                .files
                .iter()
                .filter(|(_, file)| file.state != FileState::Removed)
                .filter_map(|(ref_id, file)| {
                    let meta = fs::symlink_metadata(folder.join(&file.path)).ok()?;
                    meta.is_file().then(|| CourseFile {
                        ref_id: ref_id.clone(),
                        name: file
                            .path
                            .rsplit('/')
                            .next()
                            .unwrap_or(&file.path)
                            .to_string(),
                        path: join(&base, &file.path),
                        size: meta.len(),
                        updated_at: file.updated_at.clone(),
                        arrived: file.local_modified,
                        unseen: file.unseen,
                        gone: file.state == FileState::Gone,
                    })
                })
                .collect();
            CourseFiles {
                course_ref_id: manifest.course_ref_id,
                title: manifest.course_title,
                root: base,
                synced_at: manifest.synced_at,
                unseen: files.iter().filter(|file| file.unseen).count(),
                files,
            }
        })
        .collect()
}

fn summary(root: &Path, folder: &Path, manifest: &Manifest) -> Summary {
    let base = relative(root, folder);
    Summary {
        course_ref_id: manifest.course_ref_id.clone(),
        course_title: manifest.course_title.clone(),
        root: base.clone(),
        auto: manifest.auto,
        excluded: manifest.excluded.clone(),
        synced_at: manifest.synced_at.clone(),
        folders: manifest
            .folders
            .iter()
            .map(|(ref_id, folder)| FolderSummary {
                ref_id: ref_id.clone(),
                title: folder.title.clone(),
                path: join(&base, &folder.path),
            })
            .collect(),
        files: manifest
            .files
            .iter()
            .map(|(ref_id, file)| {
                (
                    ref_id.clone(),
                    FileSummary {
                        path: join(&base, &file.path),
                        state: file.state,
                        version: file.version,
                    },
                )
            })
            .collect(),
    }
}

/// A real folder at `root`/`relative`, made where missing. Refuses symbolic
/// links on the way, as the document workspace does everywhere.
fn ensure_folder(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut built = String::new();
    for part in relative.split('/').filter(|part| !part.is_empty()) {
        built = join(&built, part);
        let path = resolve(root, &built)?;
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => return Err(format!("“{part}” is in the way of a course folder.")),
            Err(_) => fs::create_dir(&path).map_err(|error| error.to_string())?,
        }
    }
    resolve(root, relative)
}

/// The course's synced folder, wherever the student moved it — or a new one
/// at `Courses/<semester>/<course>/ILIAS`.
fn locate_or_create(
    root: &Path,
    installation: &str,
    course: &CourseRef,
) -> Result<(PathBuf, Manifest), String> {
    if let Some(found) = manifest::find_all(root)
        .into_iter()
        .find(|(_, manifest)| manifest.belongs_to(installation, &course.ref_id))
    {
        icloud::keep_on_this_computer(&found.0);
        return Ok(found);
    }

    let segments = manifest::course_segments(course.semester.as_deref(), &course.title);
    let (course_name, parents) = segments.split_last().expect("at least Courses/<course>");
    let parent = ensure_folder(root, &parents.join("/"))?;
    // A folder of the student's own with this name is theirs to share with
    // the course; one that holds another course's files is not.
    let mut name = course_name.clone();
    let mut n = 2;
    while parent.join(&name).exists() && holds_synced_folder(&parent.join(&name)) {
        name = format!("{course_name} {n}");
        n += 1;
    }
    let course_dir = ensure_folder(root, &join(&parents.join("/"), &name))?;
    let folder_name = manifest::free_name(&course_dir, manifest::FOLDER, &[]);
    let folder = course_dir.join(&folder_name);
    fs::create_dir(&folder).map_err(|error| error.to_string())?;
    icloud::keep_on_this_computer(&folder);
    let manifest = Manifest::new(installation, &course.ref_id, &course.title);
    manifest::write(&folder, &manifest)?;
    Ok((folder, manifest))
}

/// Changes the manifest on disk under the workspace lock: read, change, write.
/// Fails when the course was stopped in the meantime.
fn update(folder: &Path, change: impl FnOnce(&mut Manifest)) -> Result<Manifest, String> {
    let mut manifest = manifest::read(folder).ok_or_else(|| STOPPED.to_string())?;
    change(&mut manifest);
    manifest::write(folder, &manifest)?;
    Ok(manifest)
}

/// Where an ILIAS folder goes, relative to the `ILIAS` folder: where it went
/// before, or a free name in its parent. Kept once chosen, so a folder
/// renamed in ILIAS does not scatter what is already here.
fn place_folder(
    manifest: &mut Manifest,
    ilias_folder: &Path,
    ref_id: &str,
    title: &str,
    parent_ref_id: &str,
    parent_dir: &str,
) -> String {
    if let Some(known) = manifest.folders.get(ref_id) {
        return known.path.clone();
    }
    let claimed: Vec<String> = manifest
        .folders
        .values()
        .map(|folder| folder.path.clone())
        .chain(manifest.files.values().map(|file| file.path.clone()))
        .filter_map(|path| {
            let (dir, name) = path.rsplit_once('/').unwrap_or(("", &path));
            (dir == parent_dir).then(|| name.to_string())
        })
        .collect();
    let wanted = manifest::local_name(title);
    let dir = ilias_folder.join(parent_dir);
    // A folder already on disk under that name, not claimed by another ILIAS
    // folder, is taken over: it is most likely this one from before.
    let name = if !claimed.contains(&wanted) && dir.join(&wanted).is_dir() {
        wanted
    } else {
        manifest::free_name(&dir, &wanted, &claimed)
    };
    let path = join(parent_dir, &name);
    manifest.folders.insert(
        ref_id.to_string(),
        TrackedFolder {
            title: title.to_string(),
            parent_ref_id: parent_ref_id.to_string(),
            path: path.clone(),
        },
    );
    path
}

/// Whether the folder `ref_id` is, or lies inside, one the student switched off.
fn under_excluded<'a>(manifest: &'a Manifest, mut ref_id: &'a str) -> bool {
    for _ in 0..64 {
        if manifest.excluded.iter().any(|excluded| excluded == ref_id) {
            return true;
        }
        match manifest.folders.get(ref_id) {
            Some(folder) => ref_id = &folder.parent_ref_id,
            None => return false,
        }
    }
    false
}

/// A download waiting to be placed.
struct Job {
    listed: Listed,
    /// The folder it goes in, relative to the `ILIAS` folder.
    dir: String,
    plan: Plan,
}

/// Where a finished download goes, and what happens to what was there.
/// Returns the file's path relative to the `ILIAS` folder, or `None` when
/// someone else already put this version in place.
fn place_file(
    root: &Path,
    ilias_folder: &Path,
    job: &Job,
    partial: &Path,
) -> Result<Option<String>, String> {
    let result = (|| {
        let mut manifest = manifest::read(ilias_folder).ok_or_else(|| STOPPED.to_string())?;
        let tracked = manifest.files.get(&job.listed.ref_id).cloned();
        let disk = tracked
            .as_ref()
            .map(|file| manifest::disk_state(ilias_folder, file))
            .unwrap_or(Disk::Missing);
        if let Some(file) = &tracked {
            if file.version == job.listed.version
                && file.updated_at == job.listed.updated_at
                && disk != Disk::Missing
            {
                return Ok(None);
            }
        }

        let dir = ilias_folder.join(&job.dir);
        let claimed: Vec<String> = manifest
            .files
            .iter()
            .filter(|(ref_id, _)| *ref_id != &job.listed.ref_id)
            .filter_map(|(_, file)| {
                let (parent, name) = file.path.rsplit_once('/').unwrap_or(("", &file.path));
                (parent == job.dir).then(|| name.to_string())
            })
            .collect();
        let wanted = manifest::file_name(&job.listed.title, job.listed.suffix.as_deref());

        let path = match (&tracked, disk) {
            // The old version as it arrived: it steps aside for the new one.
            (Some(old), Disk::Untouched) => {
                let current = ilias_folder.join(&old.path);
                let name = current
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or(wanted.clone());
                let trash = root.join(".trash");
                let aside =
                    manifest::free_name(&trash, &manifest::versioned_name(&name, old.version), &[]);
                fs::rename(&current, trash.join(aside)).map_err(|error| error.to_string())?;
                old.path.clone()
            }
            // The student's own copy stays; the new version goes beside it.
            (Some(old), Disk::Changed) => {
                let name = old.path.rsplit('/').next().unwrap_or(&wanted).to_string();
                let versioned = manifest::versioned_name(&name, job.listed.version);
                join(&job.dir, &manifest::free_name(&dir, &versioned, &claimed))
            }
            _ => join(&job.dir, &manifest::free_name(&dir, &wanted, &claimed)),
        };

        let target = resolve(root, &relative(root, &ilias_folder.join(&path)))?;
        fs::rename(partial, &target).map_err(|error| error.to_string())?;
        icloud::show(&target);
        let meta = fs::metadata(&target).map_err(|error| error.to_string())?;
        manifest.files.insert(
            job.listed.ref_id.clone(),
            Tracked {
                path: path.clone(),
                title: job.listed.title.clone(),
                parent_ref_id: job.listed.parent_ref_id.clone(),
                version: job.listed.version,
                updated_at: job.listed.updated_at.clone(),
                ilias_size: job.listed.size,
                local_size: meta.len(),
                local_modified: manifest::modified_ms(&meta),
                state: FileState::Synced,
                unseen: true,
            },
        );
        manifest::write(ilias_folder, &manifest)?;
        Ok(Some(path))
    })();
    // Whatever happened, no half-placed download stays behind.
    let _ = fs::remove_file(partial);
    result
}

/// Removes downloads an earlier run left unfinished — a quit mid-file.
fn sweep_partials(dir: &Path) {
    let Ok(items) = fs::read_dir(dir) else {
        return;
    };
    for item in items.flatten() {
        let name = item.file_name().to_string_lossy().into_owned();
        let Ok(meta) = fs::symlink_metadata(item.path()) else {
            continue;
        };
        if meta.is_dir() && !name.starts_with('.') {
            sweep_partials(&item.path());
        } else if meta.is_file() && name.starts_with(PARTIAL_PREFIX) {
            let stale = meta
                .modified()
                .ok()
                .and_then(|time| time.elapsed().ok())
                .is_some_and(|age| age.as_secs() > 60 * 60);
            if stale {
                let _ = fs::remove_file(item.path());
            }
        }
    }
}

// --- the network side --------------------------------------------------------

/// Downloads the file into a hidden file in `dir` and returns its path.
async fn download(
    app: &tauri::AppHandle,
    base_url: &str,
    client_id: &str,
    file_ref_id: &str,
    dir: &Path,
) -> Result<PathBuf, SyncError> {
    let id = ref_id(file_ref_id).map_err(SyncError::Refused)?;
    let url = Page::File(id)
        .url(base_url, client_id)
        .map_err(SyncError::Refused)?;
    let (mut response, _) = fetch::file_response(app, &url).await?;
    let partial = dir.join(format!("{PARTIAL_PREFIX}{}", manifest::nanos()));
    if let Err(error) = save(&mut response, &partial).await {
        let _ = fs::remove_file(&partial);
        return Err(SyncError::Unreachable(format!(
            "The file could not be saved: {error}"
        )));
    }
    Ok(partial)
}

fn listed_from(item: &parse::ContentItem, parent_ref_id: &str) -> Listed {
    let file = item.file.as_ref();
    Listed {
        ref_id: item.ref_id.clone(),
        parent_ref_id: item
            .parent_ref_id
            .clone()
            .unwrap_or_else(|| parent_ref_id.to_string()),
        title: item.title.clone(),
        suffix: file.and_then(|facts| facts.suffix.clone()),
        size: file.and_then(|facts| facts.size),
        version: file.map(|facts| facts.version).unwrap_or(1),
        updated_at: file.and_then(|facts| facts.updated_at.clone()),
    }
}

fn message(error: &SyncError) -> String {
    match error {
        SyncError::SignedOut => "The ILIAS sign-in has ended.".into(),
        SyncError::Refused(message)
        | SyncError::Unreachable(message)
        | SyncError::Unrecognised(message)
        | SyncError::Local(message) => message.clone(),
    }
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Every course the student keeps on this computer, for this installation.
#[tauri::command]
pub async fn ilias_mirror_list(
    app: tauri::AppHandle,
    base_url: String,
) -> Result<Vec<Summary>, SyncError> {
    let installation = installation(&base_url)?;
    with_workspace(app, move |root| {
        Ok(manifest::find_all(root)
            .into_iter()
            .filter(|(_, manifest)| manifest.installation == installation)
            .map(|(folder, manifest)| {
                icloud::keep_on_this_computer(&folder);
                summary(root, &folder, &manifest)
            })
            .collect())
    })
    .await
    .map_err(local)
}

/// Brings a course's `ILIAS` folder up to date: reads every folder the
/// student did not switch off, then downloads what is new or newer.
#[tauri::command]
pub async fn ilias_mirror_course(
    app: tauri::AppHandle,
    pace: State<'_, Pace>,
    base_url: String,
    client_id: String,
    course: CourseRef,
) -> Result<Report, SyncError> {
    let installation = installation(&base_url)?;
    let course_id = ref_id(&course.ref_id).map_err(SyncError::Refused)?;
    let _claim = Claim::take(format!("{installation}/{}", course.ref_id))?;

    let (root, folder, mut manifest) = {
        let installation = installation.clone();
        let course = course.clone();
        with_workspace(app.clone(), move |root| {
            let (folder, manifest) = locate_or_create(root, &installation, &course)?;
            sweep_partials(&folder);
            Ok((root.to_path_buf(), folder, manifest))
        })
        .await
        .map_err(local)?
    };

    // Read the course, folder by folder.
    let mut failed = Vec::new();
    let mut complete = true;
    let mut walked = HashSet::new();
    let mut files: Vec<(Listed, String)> = Vec::new();
    let mut queue = VecDeque::from([(
        course.container,
        course_id,
        course.ref_id.clone(),
        String::new(),
    )]);
    while let Some((kind, id, key, dir)) = queue.pop_front() {
        let title = manifest
            .folders
            .get(&key)
            .map(|folder| folder.title.clone());
        tell(
            &app,
            Progress {
                course_ref_id: &course.ref_id,
                phase: "reading",
                done: walked.len(),
                total: walked.len() + queue.len() + 1,
                title: title.as_deref(),
            },
        );
        let url = Page::Contents(kind, id)
            .url(&base_url, &client_id)
            .map_err(SyncError::Refused)?;
        let items = match fetch::fetch(&app, &pace, url)
            .await
            .and_then(|html| parse::read_contents(&html, today()).map_err(SyncError::Unrecognised))
        {
            Ok(items) => items,
            Err(SyncError::SignedOut) => return Err(SyncError::SignedOut),
            Err(error) => {
                complete = false;
                failed.push(Failed {
                    title: title.unwrap_or_else(|| manifest.course_title.clone()),
                    message: message(&error),
                });
                continue;
            }
        };
        walked.insert(key.clone());
        for item in items {
            match item.provider_type.as_str() {
                "fold" | "grp" => {
                    let Ok(child) = ref_id(&item.ref_id) else {
                        continue;
                    };
                    let path = place_folder(
                        &mut manifest,
                        &folder,
                        &item.ref_id,
                        &item.title,
                        &key,
                        &dir,
                    );
                    if under_excluded(&manifest, &item.ref_id) {
                        continue;
                    }
                    let container = if item.provider_type == "grp" {
                        Container::Grp
                    } else {
                        Container::Fold
                    };
                    queue.push_back((container, child, item.ref_id.clone(), path));
                }
                "file" => files.push((listed_from(&item, &key), dir.clone())),
                _ => {}
            }
        }
    }

    // Decide, file by file.
    let mut jobs = Vec::new();
    let mut too_large = Vec::new();
    let mut seen = HashSet::new();
    let mut states: Vec<(String, FileState)> = Vec::new();
    for (listed, dir) in files {
        seen.insert(listed.ref_id.clone());
        let tracked = manifest.files.get(&listed.ref_id);
        let disk = tracked
            .map(|file| manifest::disk_state(&folder, file))
            .unwrap_or(Disk::Missing);
        match manifest::plan(tracked, &listed, disk, MAX_BYTES) {
            Plan::Nothing => {}
            Plan::TooLarge => too_large.push(Skipped {
                ref_id: listed.ref_id.clone(),
                title: listed.title.clone(),
                size: listed.size,
            }),
            Plan::MarkRemoved => states.push((listed.ref_id.clone(), FileState::Removed)),
            Plan::Relisted => states.push((listed.ref_id.clone(), FileState::Synced)),
            plan @ (Plan::New | Plan::Replace | Plan::KeepBoth) => {
                jobs.push(Job { listed, dir, plan })
            }
        }
    }
    let mut gone = 0;
    if complete {
        for (ref_id, file) in &manifest.files {
            if file.state == FileState::Synced
                && !seen.contains(ref_id)
                && !under_excluded(&manifest, &file.parent_ref_id)
            {
                states.push((ref_id.clone(), FileState::Gone));
                gone += 1;
            }
        }
    }
    let folders = manifest.folders.clone();
    {
        let folder = folder.clone();
        with_workspace(app.clone(), move |_| {
            update(&folder, |on_disk| {
                for (ref_id, place) in folders {
                    on_disk.folders.entry(ref_id).or_insert(place);
                }
                for (ref_id, state) in states {
                    if let Some(file) = on_disk.files.get_mut(&ref_id) {
                        file.state = state;
                    }
                }
            })
        })
        .await
        .map_err(local)?;
    }

    // Download, one at a time, each in its turn.
    let mut added = Vec::new();
    let mut updated = Vec::new();
    let mut kept = Vec::new();
    let total = jobs.len();
    for (index, job) in jobs.into_iter().enumerate() {
        tell(
            &app,
            Progress {
                course_ref_id: &course.ref_id,
                phase: "downloading",
                done: index,
                total,
                title: Some(&job.listed.title),
            },
        );
        let dir = {
            let folder = folder.clone();
            let dir = job.dir.clone();
            with_workspace(app.clone(), move |root| {
                ensure_folder(root, &relative(root, &folder.join(dir)))
            })
            .await
            .map_err(local)?
        };
        let downloaded = {
            let mut turn = pace.turn().await;
            let result = download(&app, &base_url, &client_id, &job.listed.ref_id, &dir).await;
            *turn = Some(Instant::now());
            result
        };
        let partial = match downloaded {
            Ok(partial) => partial,
            Err(SyncError::SignedOut) => return Err(SyncError::SignedOut),
            Err(error) => {
                failed.push(Failed {
                    title: job.listed.title.clone(),
                    message: message(&error),
                });
                continue;
            }
        };
        let plan = job.plan;
        let title = job.listed.title.clone();
        let placed = {
            let folder = folder.clone();
            with_workspace(app.clone(), move |root| {
                place_file(root, &folder, &job, &partial)
            })
            .await
        };
        match placed {
            Ok(Some(path)) => {
                let path = join(&relative(&root, &folder), &path);
                match plan {
                    Plan::Replace => updated.push(path),
                    Plan::KeepBoth => kept.push(path),
                    _ => added.push(path),
                }
            }
            Ok(None) => {}
            Err(error) if error == STOPPED => return Err(SyncError::Local(error)),
            Err(error) => failed.push(Failed {
                title,
                message: error,
            }),
        }
    }

    let finished = {
        let folder = folder.clone();
        with_workspace(app.clone(), move |root| {
            let manifest = update(&folder, |on_disk| {
                if complete {
                    on_disk.synced_at = Some(now());
                }
            })?;
            Ok(summary(root, &folder, &manifest))
        })
        .await
        .map_err(local)?
    };
    tell(
        &app,
        Progress {
            course_ref_id: &course.ref_id,
            phase: "done",
            done: total,
            total,
            title: None,
        },
    );
    Ok(Report {
        summary: finished,
        added,
        updated,
        kept,
        too_large,
        gone,
        failed,
    })
}

/// One file the student clicked, saved in the course's `ILIAS` folder where
/// the sync would put it — whether or not the course syncs on its own, and
/// whatever its size. Returns where it is.
#[tauri::command]
pub async fn ilias_mirror_file(
    app: tauri::AppHandle,
    base_url: String,
    client_id: String,
    course: CourseRef,
    trail: Vec<FolderRef>,
    file: FileRef,
) -> Result<FileSummary, SyncError> {
    let installation = installation(&base_url)?;
    ref_id(&course.ref_id).map_err(SyncError::Refused)?;
    ref_id(&file.ref_id).map_err(SyncError::Refused)?;
    for folder in &trail {
        ref_id(&folder.ref_id).map_err(SyncError::Refused)?;
    }
    let parent_ref_id = trail
        .last()
        .map(|folder| folder.ref_id.clone())
        .unwrap_or_else(|| course.ref_id.clone());
    let listed = Listed {
        ref_id: file.ref_id.clone(),
        parent_ref_id,
        title: file.title.clone(),
        suffix: file.suffix.clone(),
        size: file.size,
        version: file.version,
        updated_at: file.updated_at.clone(),
    };

    // Where it goes; or, when this version is already here, where it is.
    enum Found {
        Here(FileSummary),
        Goes(PathBuf, PathBuf, String),
    }
    let found = {
        let listed = listed.clone();
        with_workspace(app.clone(), move |root| {
            let (folder, _) = locate_or_create(root, &installation, &course)?;
            let mut dir = String::new();
            let manifest = update(&folder, |manifest| {
                let mut parent = course.ref_id.clone();
                for step in &trail {
                    dir = place_folder(manifest, &folder, &step.ref_id, &step.title, &parent, &dir);
                    parent = step.ref_id.clone();
                }
            })?;
            if let Some(tracked) = manifest.files.get(&listed.ref_id) {
                if tracked.version == listed.version
                    && tracked.updated_at == listed.updated_at
                    && manifest::disk_state(&folder, tracked) != Disk::Missing
                {
                    return Ok(Found::Here(FileSummary {
                        path: join(&relative(root, &folder), &tracked.path),
                        state: tracked.state,
                        version: tracked.version,
                    }));
                }
            }
            let target = ensure_folder(root, &relative(root, &folder.join(&dir)))?;
            Ok(Found::Goes(folder, target, dir))
        })
        .await
        .map_err(local)?
    };
    let (folder, target, dir) = match found {
        Found::Here(file) => return Ok(file),
        Found::Goes(folder, target, dir) => (folder, target, dir),
    };

    // The student is waiting: this skips the sync's queue, as a click would.
    let partial = download(&app, &base_url, &client_id, &file.ref_id, &target).await?;
    let job = Job {
        listed,
        dir,
        plan: Plan::New,
    };
    with_workspace(app, move |root| {
        let path = place_file(root, &folder, &job, &partial)?;
        let manifest = manifest::read(&folder).ok_or(STOPPED)?;
        let tracked = manifest
            .files
            .get(&job.listed.ref_id)
            .ok_or("The file could not be placed.")?;
        let path = path.unwrap_or_else(|| tracked.path.clone());
        Ok(FileSummary {
            path: join(&relative(root, &folder), &path),
            state: tracked.state,
            version: tracked.version,
        })
    })
    .await
    .map_err(local)
}

/// Switches automatic syncing, or the folders left out, for a course that
/// has a folder here.
#[tauri::command]
pub async fn ilias_mirror_configure(
    app: tauri::AppHandle,
    base_url: String,
    course_ref_id: String,
    auto: Option<bool>,
    excluded: Option<Vec<String>>,
) -> Result<Summary, SyncError> {
    let installation = installation(&base_url)?;
    ref_id(&course_ref_id).map_err(SyncError::Refused)?;
    if let Some(excluded) = &excluded {
        for id in excluded {
            ref_id(id).map_err(SyncError::Refused)?;
        }
    }
    with_workspace(app, move |root| {
        let (folder, _) = manifest::find_all(root)
            .into_iter()
            .find(|(_, manifest)| manifest.belongs_to(&installation, &course_ref_id))
            .ok_or("This course has no folder on this computer.")?;
        let manifest = update(&folder, |manifest| {
            if let Some(auto) = auto {
                manifest.auto = auto;
            }
            if let Some(excluded) = excluded {
                manifest.excluded = excluded;
            }
        })?;
        Ok(summary(root, &folder, &manifest))
    })
    .await
    .map_err(local)
}

/// Stops syncing a course: its folder and files stay, as ordinary documents.
#[tauri::command]
pub async fn ilias_mirror_detach(
    app: tauri::AppHandle,
    base_url: String,
    course_ref_id: String,
) -> Result<(), SyncError> {
    let installation = installation(&base_url)?;
    ref_id(&course_ref_id).map_err(SyncError::Refused)?;
    with_workspace(app, move |root| {
        for (folder, manifest) in manifest::find_all(root) {
            if manifest.belongs_to(&installation, &course_ref_id) {
                fs::remove_file(folder.join(MANIFEST)).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(local)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Workspace(PathBuf);
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    impl Workspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "unipilot-mirror-workspace-{}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                manifest::nanos()
            ));
            fs::create_dir_all(path.join(".trash")).unwrap();
            Workspace(path)
        }
        fn course(&self, ref_id: &str, title: &str) -> CourseRef {
            CourseRef {
                ref_id: ref_id.into(),
                container: Container::Crs,
                title: title.into(),
                semester: Some("Winter 2026-27".into()),
            }
        }
        /// A finished download, as `download` leaves it.
        fn partial(&self, dir: &Path, bytes: &str) -> PathBuf {
            fs::create_dir_all(dir).unwrap();
            let path = dir.join(format!("{PARTIAL_PREFIX}{}", manifest::nanos()));
            fs::write(&path, bytes).unwrap();
            path
        }
    }
    impl Drop for Workspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn job(version: u32, plan: Plan) -> Job {
        Job {
            listed: Listed {
                ref_id: "501".into(),
                parent_ref_id: "400".into(),
                title: "Blatt 1".into(),
                suffix: Some("pdf".into()),
                size: Some(10),
                version,
                updated_at: Some(format!("2026-10-0{version}T10:00")),
            },
            dir: "Übungen".into(),
            plan,
        }
    }

    #[test]
    fn names_the_installation_as_the_page_does() {
        assert_eq!(
            installation("https://ilias.hs-heilbronn.de/").unwrap(),
            "ilias.hs-heilbronn.de"
        );
        assert_eq!(
            installation("http://localhost:8080/ilias").unwrap(),
            "localhost:8080"
        );
        assert!(installation("not a url").is_err());
    }

    #[test]
    fn puts_a_course_under_courses_and_its_semester() {
        let workspace = Workspace::new();
        let course = workspace.course("100", "Datenbanken 1");
        let (folder, manifest) = locate_or_create(&workspace.0, "ilias.example", &course).unwrap();
        assert_eq!(
            relative(&workspace.0, &folder),
            "Courses/Winter 2026-27/Datenbanken 1/ILIAS"
        );
        assert!(manifest.belongs_to("ilias.example", "100"));
        assert!(!manifest.auto);

        // Found again — also after the student moved the course folder.
        fs::create_dir_all(workspace.0.join("Archiv")).unwrap();
        fs::rename(
            workspace.0.join("Courses/Winter 2026-27/Datenbanken 1"),
            workspace.0.join("Archiv/DB"),
        )
        .unwrap();
        let (again, _) = locate_or_create(&workspace.0, "ilias.example", &course).unwrap();
        assert_eq!(relative(&workspace.0, &again), "Archiv/DB/ILIAS");
    }

    #[test]
    fn shares_the_students_own_course_folder_but_not_another_courses() {
        let workspace = Workspace::new();
        let mine = workspace.0.join("Courses/Winter 2026-27/Logik");
        fs::create_dir_all(&mine).unwrap();
        fs::write(mine.join("Zusammenfassung.md"), "# Logik").unwrap();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Logik"),
        )
        .unwrap();
        assert_eq!(folder, mine.join("ILIAS"));
        assert!(mine.join("Zusammenfassung.md").exists());

        // Another course with the same name gets a folder of its own.
        let (other, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("2", "Logik"),
        )
        .unwrap();
        assert_eq!(
            relative(&workspace.0, &other),
            "Courses/Winter 2026-27/Logik 2/ILIAS"
        );

        // A detached ILIAS folder is left as it is; the course gets a new one.
        fs::remove_file(folder.join(MANIFEST)).unwrap();
        let (fresh, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Logik"),
        )
        .unwrap();
        assert_eq!(fresh, mine.join("ILIAS 2"));
    }

    #[test]
    fn keeps_a_folder_where_it_first_went() {
        let mut manifest = Manifest::new("ilias.example", "1", "Kurs");
        let dir = Workspace::new();
        let first = place_folder(&mut manifest, &dir.0, "10", "Folien", "1", "");
        let twin = place_folder(&mut manifest, &dir.0, "11", "Folien", "1", "");
        let nested = place_folder(
            &mut manifest,
            &dir.0,
            "12",
            "Teil 1: Grundlagen",
            "10",
            &first,
        );
        assert_eq!(first, "Folien");
        assert_eq!(twin, "Folien 2");
        assert_eq!(nested, "Folien/Teil 1 - Grundlagen");
        // Renamed in ILIAS: the files already here stay where they are.
        assert_eq!(
            place_folder(&mut manifest, &dir.0, "10", "Vorlesungsfolien", "1", ""),
            "Folien"
        );
    }

    #[test]
    fn leaves_switched_off_folders_and_everything_in_them() {
        let mut manifest = Manifest::new("ilias.example", "1", "Kurs");
        let dir = Workspace::new();
        let videos = place_folder(&mut manifest, &dir.0, "20", "Videos", "1", "");
        place_folder(&mut manifest, &dir.0, "21", "Woche 1", "20", &videos);
        manifest.excluded = vec!["20".into()];
        assert!(under_excluded(&manifest, "20"));
        assert!(under_excluded(&manifest, "21"));
        assert!(!under_excluded(&manifest, "1"));
    }

    #[test]
    fn places_a_new_file_and_remembers_it() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        let partial = workspace.partial(&folder.join("Übungen"), "blatt eins");
        let path = place_file(&workspace.0, &folder, &job(1, Plan::New), &partial)
            .unwrap()
            .unwrap();
        assert_eq!(path, "Übungen/Blatt 1.pdf");
        assert_eq!(
            fs::read_to_string(folder.join("Übungen/Blatt 1.pdf")).unwrap(),
            "blatt eins"
        );
        assert!(!partial.exists());
        let tracked = manifest::read(&folder).unwrap().files["501"].clone();
        assert_eq!(tracked.state, FileState::Synced);
        assert!(tracked.unseen, "a file that just arrived is new");
        assert_eq!(manifest::disk_state(&folder, &tracked), Disk::Untouched);

        // The same version again is not placed twice.
        let again = workspace.partial(&folder.join("Übungen"), "blatt eins");
        assert_eq!(
            place_file(&workspace.0, &folder, &job(1, Plan::New), &again).unwrap(),
            None
        );
        assert!(!again.exists());
    }

    #[test]
    fn a_new_version_replaces_an_untouched_file_and_the_old_one_is_recoverable() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        let first = workspace.partial(&folder.join("Übungen"), "version one");
        place_file(&workspace.0, &folder, &job(1, Plan::New), &first).unwrap();

        let second = workspace.partial(&folder.join("Übungen"), "version two");
        let path = place_file(&workspace.0, &folder, &job(2, Plan::Replace), &second)
            .unwrap()
            .unwrap();
        assert_eq!(path, "Übungen/Blatt 1.pdf");
        assert_eq!(
            fs::read_to_string(folder.join("Übungen/Blatt 1.pdf")).unwrap(),
            "version two"
        );
        assert_eq!(
            fs::read_to_string(workspace.0.join(".trash/Blatt 1 (version 1).pdf")).unwrap(),
            "version one"
        );
        assert_eq!(manifest::read(&folder).unwrap().files["501"].version, 2);
    }

    #[test]
    fn lists_every_course_with_the_files_still_there() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Datenbanken"),
        )
        .unwrap();
        let first = workspace.partial(&folder.join("Übungen"), "blatt eins");
        place_file(&workspace.0, &folder, &job(1, Plan::New), &first).unwrap();
        let mut second = job(1, Plan::New);
        second.listed.ref_id = "502".into();
        second.listed.title = "Blatt 2".into();
        let partial = workspace.partial(&folder.join("Übungen"), "blatt zwei");
        place_file(&workspace.0, &folder, &second, &partial).unwrap();
        mark_seen(&workspace.0, &folder.join("Übungen/Blatt 1.pdf")).unwrap();
        fs::remove_file(folder.join("Übungen/Blatt 2.pdf")).unwrap();

        let courses = courses(&workspace.0);
        assert_eq!(courses.len(), 1);
        let course = &courses[0];
        assert_eq!(course.title, "Datenbanken");
        assert_eq!(course.root, "Courses/Winter 2026-27/Datenbanken/ILIAS");
        assert_eq!(course.unseen, 0, "the deleted new file is not counted");
        assert_eq!(course.files.len(), 1);
        let file = &course.files[0];
        assert_eq!(file.name, "Blatt 1.pdf");
        assert_eq!(
            file.path,
            "Courses/Winter 2026-27/Datenbanken/ILIAS/Übungen/Blatt 1.pdf"
        );
        assert_eq!(file.updated_at.as_deref(), Some("2026-10-01T10:00"));
        assert!(file.arrived > 0);
        assert!(!file.unseen && !file.gone);
    }

    #[test]
    fn a_new_version_is_new_again_after_the_old_one_was_opened() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        let first = workspace.partial(&folder.join("Übungen"), "version one");
        place_file(&workspace.0, &folder, &job(1, Plan::New), &first).unwrap();
        mark_seen(&workspace.0, &folder.join("Übungen/Blatt 1.pdf")).unwrap();
        assert!(!manifest::read(&folder).unwrap().files["501"].unseen);

        let second = workspace.partial(&folder.join("Übungen"), "version two");
        place_file(&workspace.0, &folder, &job(2, Plan::Replace), &second).unwrap();
        assert!(manifest::read(&folder).unwrap().files["501"].unseen);
    }

    #[test]
    fn a_new_version_goes_beside_a_file_the_student_changed() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        let first = workspace.partial(&folder.join("Übungen"), "version one");
        place_file(&workspace.0, &folder, &job(1, Plan::New), &first).unwrap();
        fs::write(
            folder.join("Übungen/Blatt 1.pdf"),
            "version one, with my notes",
        )
        .unwrap();

        let second = workspace.partial(&folder.join("Übungen"), "version two");
        let path = place_file(&workspace.0, &folder, &job(2, Plan::KeepBoth), &second)
            .unwrap()
            .unwrap();
        assert_eq!(path, "Übungen/Blatt 1 (version 2).pdf");
        assert_eq!(
            fs::read_to_string(folder.join("Übungen/Blatt 1.pdf")).unwrap(),
            "version one, with my notes"
        );
        let manifest = manifest::read(&folder).unwrap();
        assert_eq!(
            manifest.files["501"].path,
            "Übungen/Blatt 1 (version 2).pdf"
        );
        // The student's copy is theirs now, and no longer tracked.
        assert!(manifest.file_at("Übungen/Blatt 1.pdf").is_none());
    }

    #[test]
    fn never_overwrites_a_file_of_the_students_with_the_same_name() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        fs::create_dir_all(folder.join("Übungen")).unwrap();
        fs::write(folder.join("Übungen/Blatt 1.pdf"), "mine").unwrap();
        let partial = workspace.partial(&folder.join("Übungen"), "from ilias");
        let path = place_file(&workspace.0, &folder, &job(1, Plan::New), &partial)
            .unwrap()
            .unwrap();
        assert_eq!(path, "Übungen/Blatt 1 2.pdf");
        assert_eq!(
            fs::read_to_string(folder.join("Übungen/Blatt 1.pdf")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn a_stopped_course_takes_no_more_files() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        fs::remove_file(folder.join(MANIFEST)).unwrap();
        let partial = workspace.partial(&folder.join("Übungen"), "late");
        let error = place_file(&workspace.0, &folder, &job(1, Plan::New), &partial).unwrap_err();
        assert_eq!(error, STOPPED);
        assert!(!partial.exists());
        assert!(!folder.join("Übungen/Blatt 1.pdf").exists());
    }

    #[test]
    fn sums_up_a_course_with_workspace_paths() {
        let workspace = Workspace::new();
        let (folder, _) = locate_or_create(
            &workspace.0,
            "ilias.example",
            &workspace.course("1", "Kurs"),
        )
        .unwrap();
        let partial = workspace.partial(&folder.join("Übungen"), "x");
        place_file(&workspace.0, &folder, &job(1, Plan::New), &partial).unwrap();
        let manifest = manifest::read(&folder).unwrap();
        let summary = summary(&workspace.0, &folder, &manifest);
        assert_eq!(summary.root, "Courses/Winter 2026-27/Kurs/ILIAS");
        assert_eq!(
            summary.files["501"].path,
            "Courses/Winter 2026-27/Kurs/ILIAS/Übungen/Blatt 1.pdf"
        );
        assert_eq!(
            serde_json::to_value(&summary.files["501"]).unwrap(),
            serde_json::json!({
                "path": "Courses/Winter 2026-27/Kurs/ILIAS/Übungen/Blatt 1.pdf",
                "state": "synced",
                "version": 1
            })
        );
    }

    #[test]
    fn clears_away_downloads_left_unfinished_long_ago_only() {
        let workspace = Workspace::new();
        let fresh = workspace.partial(&workspace.0.join("a"), "x");
        sweep_partials(&workspace.0);
        assert!(fresh.exists());
    }
}
