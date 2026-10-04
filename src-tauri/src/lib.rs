mod apple_mail;
mod documents;
mod face_unlock;
mod ilias_browser;
mod ilias_links;
mod ilias_sign_out;
mod ilias_sync;
mod ilias_view;
mod ilias_window;
mod reminders;
mod vault;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            reminders::reminder_request,
            documents::document_request,
            documents::document_upload,
            ilias_window::open_ilias,
            ilias_view::enter_ilias_mode,
            ilias_view::leave_ilias_mode,
            ilias_view::navigate_ilias,
            ilias_view::close_ilias_view,
            ilias_browser::travel_ilias,
            ilias_browser::ilias_history,
            ilias_browser::open_ilias_download,
            ilias_browser::reveal_ilias_download,
            ilias_links::open_ilias_in_browser,
            ilias_sign_out::sign_out_of_ilias,
            ilias_sync::ilias_sync_courses,
            ilias_sync::ilias_sync_contents,
            ilias_sync::ilias_sync_assignments,
            ilias_sync::mirror::ilias_mirror_list,
            ilias_sync::mirror::ilias_mirror_course,
            ilias_sync::mirror::ilias_mirror_file,
            ilias_sync::mirror::ilias_mirror_configure,
            ilias_sync::mirror::ilias_mirror_detach,
            ilias_sync::reauth::ilias_sync_reauth,
            ilias_sync::sign_in::sign_in_to_ilias,
            vault::auto_sign_in_status,
            vault::auto_sign_in_save,
            vault::auto_sign_in_forget,
            vault::auto_sign_in_code,
            face_unlock::face_enroll_start,
            face_unlock::face_enroll_frame,
            face_unlock::face_enroll_cancel,
            face_unlock::face_unlock_start,
            face_unlock::face_unlock_frame,
            face_unlock::face_unlock_finish,
            face_unlock::face_unlock_cancel,
            apple_mail::mail_accounts,
            apple_mail::mail_inbox,
            apple_mail::mail_open,
            apple_mail::mail_launch,
            apple_mail::mail_previews,
            apple_mail::mail_message,
            apple_mail::mail_mark_read,
            apple_mail::mail_reply,
            apple_mail::mail_compose
        ])
        .manage(ilias_view::Mode::default())
        .manage(ilias_browser::Downloads::default())
        .manage(ilias_sync::Pace::default())
        .manage(face_unlock::FaceUnlock::default());
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
