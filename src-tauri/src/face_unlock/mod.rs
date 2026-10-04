//! Face unlock: the student looks into the camera, and Uni Pilot signs in to
//! HHN for them (`docs/face-unlock-plan.md`, Phases 4–5). Opt-in, on top of
//! signing in automatically (`ilias_sync::sign_in`).
//!
//! - `frame`: a JPEG from the page, decoded.
//! - `detect`: YuNet — exactly one face, with five landmarks.
//! - `align`: the face onto SFace's 112×112 template.
//! - `embed`: SFace's 128 numbers, and how alike two faces are.
//! - `liveness`: head turn and size from the landmarks. No anti-spoofing
//!   model yet: see `models/README.md`.
//! - `attempt`: enrolment, unlock and lockout, with no I/O.
//! - `models`: loading YuNet and SFace and running a frame through both.
//!
//! The page sends frames — raw JPEG bytes over IPC, about six a second — and
//! gets back prompts and progress only: never the template, the password or a
//! code, and never whether a face matched. Rust decides, and on success signs
//! in itself. The credential store is read when an unlock starts, before the
//! page may turn the camera on; if that fails, the camera stays off. Frames
//! are dropped as soon as they are looked at. Only Uni Pilot's own page may
//! ask (`sign_in::is_main`).

mod align;
mod attempt;
mod detect;
mod embed;
mod frame;
mod liveness;
mod models;

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, State, Webview};

use crate::ilias_sync::sign_in::{self, SignInError};
use crate::vault::{self, Credentials, VaultError};
use attempt::{Enrolled, Enrolment, Lockout, Prompt, Unlock, Unlocking};
use models::Models;

/// Why face unlock could not go on. The page decides what to say from the
/// kind; the camera is off whenever one comes back.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum FaceError {
    /// No sign-in is stored for this ILIAS.
    NotSetUp,
    /// HHN refused the stored password; it has to be saved again first.
    PasswordRefused,
    /// No face is enrolled.
    NoFace,
    /// Three unlocks failed: the face is not asked again until the student
    /// signs in by hand or five minutes have passed.
    Locked,
    /// Ten seconds went by without the challenges met by the enrolled face.
    NotRecognised,
    /// Face unlock cannot run on this computer: no models, no credential store.
    Unavailable(String),
    /// The face passed; signing in did not work.
    SignIn(SignInError),
    /// Uni Pilot could not do its part: a frame out of turn, a broken frame.
    Local(String),
}

fn from_vault(error: VaultError) -> FaceError {
    match error {
        VaultError::Refused => {
            FaceError::Unavailable("Access to the stored sign-in was declined.".into())
        }
        VaultError::Invalid(message) | VaultError::Unavailable(message) => {
            FaceError::Unavailable(message)
        }
    }
}

fn from_main(webview: &Webview) -> Result<(), FaceError> {
    if sign_in::is_main(webview.label()) {
        Ok(())
    } else {
        Err(FaceError::Local(
            "Only Uni Pilot's own window can use face unlock.".into(),
        ))
    }
}

struct UnlockRun {
    unlock: Unlock,
    passed: bool,
    credentials: Credentials,
    base_url: String,
    client_id: String,
}

struct Session {
    models: Option<Arc<Models>>,
    enrolment: Option<Enrolment>,
    unlock: Option<UnlockRun>,
    lockout: Lockout,
    epoch: Instant,
}

/// Face unlock's state, managed by Tauri: the loaded models, the attempt in
/// progress, the lockout. Kept in memory; quitting Uni Pilot forgets it.
pub struct FaceUnlock(Mutex<Session>);

impl Default for FaceUnlock {
    fn default() -> Self {
        Self(Mutex::new(Session {
            models: None,
            enrolment: None,
            unlock: None,
            lockout: Lockout::default(),
            epoch: Instant::now(),
        }))
    }
}

impl Session {
    fn now(&self) -> u64 {
        self.epoch.elapsed().as_millis() as u64
    }
}

impl FaceUnlock {
    fn session(&self) -> MutexGuard<'_, Session> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// ILIAS answered a page that only a signed-in student gets: the student
    /// is signed in, by hand or otherwise, and the lockout is lifted.
    pub fn signed_in(&self) {
        self.session().lockout.signed_in();
    }

    fn models(&self) -> Result<Arc<Models>, FaceError> {
        self.session()
            .models
            .clone()
            .ok_or_else(|| FaceError::Local("Face unlock has not started.".into()))
    }
}

/// The models, loaded the first time they are needed.
async fn models(app: &tauri::AppHandle, state: &FaceUnlock) -> Result<Arc<Models>, FaceError> {
    if let Some(models) = state.session().models.clone() {
        return Ok(models);
    }
    let dir = app
        .path()
        .resource_dir()
        .map_err(|error| FaceError::Unavailable(error.to_string()))?
        .join("models");
    let loaded = tauri::async_runtime::spawn_blocking(move || Models::load(&dir))
        .await
        .map_err(|error| FaceError::Local(error.to_string()))?
        .map_err(|error| {
            eprintln!("Face unlock: {error}");
            FaceError::Unavailable("This copy of Uni Pilot does not have the face models.".into())
        })?;
    let loaded = Arc::new(loaded);
    state.session().models = Some(loaded.clone());
    Ok(loaded)
}

fn jpeg(request: &Request<'_>) -> Result<Vec<u8>, FaceError> {
    match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() => Ok(bytes.clone()),
        _ => Err(FaceError::Local("A camera frame was expected.".into())),
    }
}

async fn see(models: Arc<Models>, jpeg: Vec<u8>) -> Result<attempt::Seen, FaceError> {
    tauri::async_runtime::spawn_blocking(move || models.see(&jpeg))
        .await
        .map_err(|error| FaceError::Local(error.to_string()))?
        .map_err(FaceError::Local)
}

/// A random number for the challenges' order: not a secret, only not
/// predictable from one attempt to the next.
fn random() -> u64 {
    use std::hash::{BuildHasher, Hasher};
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    hasher.write_u128(now.as_nanos());
    hasher.finish()
}

// Enrolment ---------------------------------------------------------------

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrolProgress {
    prompt: Prompt,
    taken: usize,
    needed: usize,
    done: bool,
}

/// Gets ready to enrol: a sign-in has to be stored for this ILIAS, and the
/// models have to load. The page turns the camera on only after this answered.
#[tauri::command]
pub async fn face_enroll_start(
    app: tauri::AppHandle,
    webview: Webview,
    state: State<'_, FaceUnlock>,
    base_url: String,
) -> Result<EnrolProgress, FaceError> {
    from_main(&webview)?;
    let stored = vault::stored_sign_in(&base_url).await.map_err(from_vault)?;
    match stored {
        None => return Err(FaceError::NotSetUp),
        Some(credentials) if credentials.stale => return Err(FaceError::PasswordRefused),
        Some(_) => {}
    }
    models(&app, &state).await?;
    let enrolment = Enrolment::default();
    let prompt = enrolment.prompt();
    state.session().enrolment = Some(enrolment);
    Ok(EnrolProgress {
        prompt,
        taken: 0,
        needed: attempt::ENROLMENT_FRAMES,
        done: false,
    })
}

/// One frame for the enrolment. The last good one stores the template.
#[tauri::command]
pub async fn face_enroll_frame(
    webview: Webview,
    state: State<'_, FaceUnlock>,
    request: Request<'_>,
) -> Result<EnrolProgress, FaceError> {
    from_main(&webview)?;
    let jpeg = jpeg(&request)?;
    let seen = see(state.models()?, jpeg).await?;
    let result = {
        let mut session = state.session();
        let enrolment = session
            .enrolment
            .as_mut()
            .ok_or_else(|| FaceError::Local("No enrolment is running.".into()))?;
        let result = enrolment.frame(seen);
        if matches!(result, Enrolled::Done(_)) {
            session.enrolment = None;
        }
        result
    };
    let needed = attempt::ENROLMENT_FRAMES;
    match result {
        Enrolled::Going { prompt, taken } => Ok(EnrolProgress {
            prompt,
            taken,
            needed,
            done: false,
        }),
        Enrolled::Done(template) => {
            vault::save_face(embed::to_bytes(&template))
                .await
                .map_err(from_vault)?;
            eprintln!("Face unlock: a face was enrolled.");
            Ok(EnrolProgress {
                prompt: Prompt::LookAtCamera,
                taken: needed,
                needed,
                done: true,
            })
        }
    }
}

#[tauri::command]
pub fn face_enroll_cancel(webview: Webview, state: State<'_, FaceUnlock>) -> Result<(), FaceError> {
    from_main(&webview)?;
    state.session().enrolment = None;
    Ok(())
}

// Unlock ------------------------------------------------------------------

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UnlockProgress {
    Looking {
        prompt: Prompt,
        done: usize,
        of: usize,
    },
    /// The face passed; `face_unlock_finish` signs in.
    Passed,
}

/// Gets ready to unlock: not locked out, the stored sign-in and face read
/// from the credential store, the models loaded. Only then may the page turn
/// the camera on; if any of it fails, it stays off.
#[tauri::command]
pub async fn face_unlock_start(
    app: tauri::AppHandle,
    webview: Webview,
    state: State<'_, FaceUnlock>,
    base_url: String,
    client_id: String,
) -> Result<UnlockProgress, FaceError> {
    from_main(&webview)?;
    {
        let mut session = state.session();
        let now = session.now();
        if session.lockout.locked(now) {
            return Err(FaceError::Locked);
        }
    }
    if !sign_in::knows_sign_on(&base_url) {
        return Err(FaceError::Unavailable(
            "Uni Pilot does not know where this ILIAS signs students in.".into(),
        ));
    }
    let credentials = vault::stored_sign_in(&base_url)
        .await
        .map_err(from_vault)?
        .ok_or(FaceError::NotSetUp)?;
    if credentials.stale {
        return Err(FaceError::PasswordRefused);
    }
    let template = vault::stored_face()
        .await
        .map_err(from_vault)?
        .ok_or(FaceError::NoFace)?;
    let template = embed::from_bytes(&template)
        .ok_or_else(|| FaceError::Unavailable("The stored face could not be read.".into()))?;
    models(&app, &state).await?;

    let mut session = state.session();
    let now = session.now();
    session.unlock = Some(UnlockRun {
        unlock: Unlock::new(template, attempt::challenges(random()), now),
        passed: false,
        credentials,
        base_url,
        client_id,
    });
    Ok(UnlockProgress::Looking {
        prompt: Prompt::LookAtCamera,
        done: 0,
        of: attempt::CHALLENGES,
    })
}

/// One frame for the unlock. Ten seconds without the challenges met count as
/// one failed attempt.
#[tauri::command]
pub async fn face_unlock_frame(
    webview: Webview,
    state: State<'_, FaceUnlock>,
    request: Request<'_>,
) -> Result<UnlockProgress, FaceError> {
    from_main(&webview)?;
    let jpeg = jpeg(&request)?;
    let seen = see(state.models()?, jpeg).await?;
    let mut session = state.session();
    let now = session.now();
    let run = session
        .unlock
        .as_mut()
        .ok_or_else(|| FaceError::Local("No face unlock is running.".into()))?;
    if run.passed {
        return Ok(UnlockProgress::Passed);
    }
    #[cfg(debug_assertions)]
    let measured = measured(&run.unlock, &seen);
    let result = run.unlock.frame(seen, now);
    #[cfg(debug_assertions)]
    eprintln!("Face unlock: {measured} → {}", answered(&result));
    match result {
        Unlocking::Going { prompt, done } => Ok(UnlockProgress::Looking {
            prompt,
            done,
            of: attempt::CHALLENGES,
        }),
        Unlocking::Passed => {
            run.passed = true;
            session.lockout.signed_in();
            eprintln!("Face unlock: the face passed.");
            Ok(UnlockProgress::Passed)
        }
        Unlocking::TimedOut => {
            session.unlock = None;
            session.lockout.failed(now);
            eprintln!("Face unlock: not recognised in time.");
            Err(FaceError::NotRecognised)
        }
    }
}

/// What one unlock frame measured, for the development log: numbers only —
/// no frame, no template, no embedding.
#[cfg(debug_assertions)]
fn measured(unlock: &Unlock, seen: &attempt::Seen) -> String {
    match seen {
        attempt::Seen::NoFace => "no face".into(),
        attempt::Seen::SeveralFaces => "several faces".into(),
        attempt::Seen::Face(face) => format!(
            "cosine {:.3}, yaw {:+.3}, box width {:.3} of the frame",
            unlock.likeness(&face.embedding),
            face.yaw,
            face.size
        ),
    }
}

#[cfg(debug_assertions)]
fn answered(result: &Unlocking) -> String {
    match result {
        Unlocking::Going { prompt, done } => {
            format!("prompt {prompt:?}, {done} of {} done", attempt::CHALLENGES)
        }
        Unlocking::Passed => "passed".into(),
        Unlocking::TimedOut => "timed out".into(),
    }
}

/// After the face passed, with the camera off: signs in with the values read
/// at the start. `true` when ILIAS has a session again.
#[tauri::command]
pub async fn face_unlock_finish(
    app: tauri::AppHandle,
    webview: Webview,
    state: State<'_, FaceUnlock>,
) -> Result<bool, FaceError> {
    from_main(&webview)?;
    let run = {
        let mut session = state.session();
        match session.unlock.take() {
            Some(run) if run.passed => run,
            other => {
                session.unlock = other;
                return Err(FaceError::Local("The face has not passed.".into()));
            }
        }
    };
    sign_in::sign_in_as(&app, &run.base_url, &run.client_id, &run.credentials)
        .await
        .map_err(FaceError::SignIn)
}

/// The student closed the dialog or Uni Pilot lost focus. An attempt that
/// saw a face and did not pass counts as failed — otherwise closing and
/// starting again would get round the lockout.
#[tauri::command]
pub fn face_unlock_cancel(webview: Webview, state: State<'_, FaceUnlock>) -> Result<(), FaceError> {
    from_main(&webview)?;
    let mut session = state.session();
    if let Some(run) = session.unlock.take() {
        if !run.passed && run.unlock.saw_a_face() {
            let now = session.now();
            session.lockout.failed(now);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The shapes the page reads in `faceUnlock.ts`. No template, no code.
    #[test]
    fn tells_the_page_progress_and_nothing_else() {
        assert_eq!(
            serde_json::to_value(UnlockProgress::Looking {
                prompt: Prompt::TurnLeft,
                done: 1,
                of: 2
            })
            .unwrap(),
            serde_json::json!({ "state": "looking", "prompt": "turnLeft", "done": 1, "of": 2 })
        );
        assert_eq!(
            serde_json::to_value(UnlockProgress::Passed).unwrap(),
            serde_json::json!({ "state": "passed" })
        );
        assert_eq!(
            serde_json::to_value(FaceError::SignIn(SignInError::WrongCode)).unwrap(),
            serde_json::json!({ "kind": "signIn", "message": { "kind": "wrongCode" } })
        );
        assert_eq!(
            serde_json::to_value(FaceError::Locked).unwrap(),
            serde_json::json!({ "kind": "locked" })
        );
    }

    /// The development log carries three numbers and the answer — nothing of
    /// the frame, the template or the embedding.
    #[cfg(debug_assertions)]
    #[test]
    fn logs_numbers_only() {
        let template = embed::tests::towards(0, 1, 0.1);
        let unlock = Unlock::new(template, attempt::challenges(0), 0);
        let face = attempt::Seen::Face(attempt::Face {
            embedding: template,
            yaw: 0.2,
            size: 0.25,
        });
        assert_eq!(
            measured(&unlock, &face),
            "cosine 1.000, yaw +0.200, box width 0.250 of the frame"
        );
        assert_eq!(measured(&unlock, &attempt::Seen::NoFace), "no face");
        assert_eq!(
            answered(&Unlocking::Going {
                prompt: Prompt::TurnLeft,
                done: 1
            }),
            "prompt TurnLeft, 1 of 2 done"
        );
    }

    #[test]
    fn varies_the_challenges() {
        let orders: std::collections::HashSet<_> = (0..200)
            .map(|_| format!("{:?}", attempt::challenges(random())))
            .collect();
        assert!(orders.len() > 1);
    }
}
