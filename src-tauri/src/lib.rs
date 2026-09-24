mod ilias_browser;
mod ilias_view;
mod ilias_window;
mod reminders;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            reminders::reminder_request,
            ilias_window::open_ilias,
            ilias_view::enter_ilias_mode,
            ilias_view::leave_ilias_mode,
            ilias_view::navigate_ilias,
            ilias_view::close_ilias_view,
            ilias_browser::travel_ilias,
            ilias_browser::ilias_history,
            ilias_browser::open_ilias_download,
            ilias_browser::reveal_ilias_download
        ])
        .manage(ilias_view::Mode::default())
        .manage(ilias_browser::Downloads::default());
    #[cfg(target_os = "macos")]
    let builder = builder.manage(reminders::Runtime::default());
    builder
        .on_window_event(|window, event| {
            // In ILIAS mode the page is only the strip and cannot see the
            // window, so the layout follows the window from here.
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
                )
            {
                ilias_view::relayout(window.app_handle());
            }
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Uni Pilot")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
