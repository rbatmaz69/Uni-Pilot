//! JSON-lines bridge to the macOS companion. The child schedules independently
//! of WebKit timers and exits on stdin EOF when Uni-Pilot quits.
#[cfg(target_os = "macos")]
mod macos {
    use std::{
        io::{BufRead, BufReader, Write},
        os::unix::fs::PermissionsExt,
        process::{Child, ChildStdin, ChildStdout, Command, Stdio},
        sync::Mutex,
    };
    use tauri::Manager;

    pub struct Companion {
        child: Child,
        input: ChildStdin,
        output: BufReader<ChildStdout>,
    }
    impl Drop for Companion {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
    pub type Runtime = Mutex<Option<Companion>>;

    fn start(app: &tauri::AppHandle) -> Result<Companion, String> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("reminders");
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let executable = directory.join("uni-pilot-reminders");
        let binary = include_bytes!(concat!(env!("OUT_DIR"), "/uni-pilot-reminders"));
        // Atomic replacement also allows app upgrades while a previous helper exits.
        let temporary = directory.join("uni-pilot-reminders.tmp");
        std::fs::write(&temporary, binary).map_err(|e| e.to_string())?;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, &executable).map_err(|e| e.to_string())?;
        let plane = directory.join("plane.png");
        std::fs::write(&plane, include_bytes!("../../public/reminders/plane.png"))
            .map_err(|e| e.to_string())?;
        let mut child = Command::new(executable)
            .arg(directory.join("history.json"))
            .arg(plane)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| e.to_string())?;
        let input = child.stdin.take().ok_or("Missing reminder input")?;
        let output = BufReader::new(child.stdout.take().ok_or("Missing reminder output")?);
        Ok(Companion {
            child,
            input,
            output,
        })
    }

    pub fn request(
        app: tauri::AppHandle,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let state = app.state::<Runtime>();
        let mut runtime = state.lock().map_err(|e| e.to_string())?;
        if runtime.is_none() {
            *runtime = Some(start(&app)?);
        }
        let companion = runtime.as_mut().ok_or("Reminders unavailable")?;
        let result = (|| {
            serde_json::to_writer(&mut companion.input, &payload).map_err(|e| e.to_string())?;
            companion
                .input
                .write_all(b"\n")
                .map_err(|e| e.to_string())?;
            companion.input.flush().map_err(|e| e.to_string())?;
            let mut line = String::new();
            companion
                .output
                .read_line(&mut line)
                .map_err(|e| e.to_string())?;
            let value: serde_json::Value =
                serde_json::from_str(&line).map_err(|e| e.to_string())?;
            if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
                return Err(error.to_string());
            }
            Ok(value)
        })();
        if result.is_err() {
            *runtime = None;
        }
        result
    }
}

#[cfg(target_os = "macos")]
pub use macos::Runtime;

#[tauri::command]
pub async fn reminder_request(
    app: tauri::AppHandle,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || macos::request(app, payload))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, payload);
        Err("Desktop airplane reminders are available on macOS.".into())
    }
}
