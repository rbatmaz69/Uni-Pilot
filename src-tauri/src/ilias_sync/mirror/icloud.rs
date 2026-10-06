//! Keeping a course's `ILIAS` folder on this computer.
//!
//! With Desktop & Documents in iCloud Drive and "Optimise Mac Storage" on,
//! macOS moves files nobody opened lately to iCloud and leaves a placeholder.
//! Reading one fetches it first: slowly, and without a network not at all.
//! The document canvas reads every card's file, so ILIAS's PDFs came back
//! from iCloud each time Documents opened.
//!
//! The sync's copies can always come again from ILIAS, so they need no
//! second home in iCloud. The File Provider's ignore attribute on the `ILIAS`
//! folder takes it out of iCloud Drive, together with everything that later
//! arrives in it. macOS fetches back what it had already moved away. The
//! student's own folders around it stay in iCloud.
//!
//! iCloud Drive also marks a file hidden in Finder when its name starts with
//! a dot, and keeps the mark when the file is renamed. Every download starts
//! as `.unipilot-download-…`, so a finished file could stay hidden in Finder.
//! `show` clears that mark on each file the sync places, and the first
//! `keep_on_this_computer` clears it on the files already there.
//!
//! Without iCloud Drive the attribute changes nothing. On other systems these
//! functions do nothing.

use std::path::Path;

/// Takes `folder` out of iCloud Drive, once; later calls only look.
pub(crate) fn keep_on_this_computer(folder: &Path) {
    #[cfg(target_os = "macos")]
    if !mac::is_kept(folder) && mac::keep(folder) {
        show_below(folder);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = folder;
}

/// Clears Finder's hidden mark on a file the sync placed.
pub(crate) fn show(path: &Path) {
    #[cfg(target_os = "macos")]
    mac::unhide(path);
    #[cfg(not(target_os = "macos"))]
    let _ = path;
}

#[cfg(target_os = "macos")]
fn show_below(folder: &Path) {
    let Ok(items) = std::fs::read_dir(folder) else {
        return;
    };
    for item in items.flatten() {
        // Names that start with a dot are hidden by name, and meant to be.
        if item.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let Ok(meta) = std::fs::symlink_metadata(item.path()) else {
            continue;
        };
        if meta.is_dir() {
            show_below(&item.path());
        } else if meta.is_file() {
            mac::unhide(&item.path());
        }
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::{CStr, CString};
    use std::os::macos::fs::MetadataExt;
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;

    /// Set on a folder, iCloud Drive leaves it and everything in it alone:
    /// `URLResourceValues.ubiquitousItemIsExcludedFromSync` reads true.
    const IGNORE: &CStr = c"com.apple.fileprovider.ignore#P";

    fn c_path(path: &Path) -> Option<CString> {
        CString::new(path.as_os_str().as_bytes()).ok()
    }

    pub fn is_kept(path: &Path) -> bool {
        let Some(path) = c_path(path) else {
            return false;
        };
        // SAFETY: both strings are NUL-terminated and live through the call;
        // a null buffer of size 0 asks only whether the attribute exists.
        unsafe {
            libc::getxattr(
                path.as_ptr(),
                IGNORE.as_ptr(),
                std::ptr::null_mut(),
                0,
                0,
                libc::XATTR_NOFOLLOW,
            ) >= 0
        }
    }

    pub fn keep(path: &Path) -> bool {
        let Some(path) = c_path(path) else {
            return false;
        };
        let value = b"1";
        // SAFETY: the path and name are NUL-terminated, the value is `len`
        // bytes long, and all three live through the call.
        unsafe {
            libc::setxattr(
                path.as_ptr(),
                IGNORE.as_ptr(),
                value.as_ptr().cast(),
                value.len(),
                0,
                libc::XATTR_NOFOLLOW,
            ) == 0
        }
    }

    pub fn unhide(path: &Path) {
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            return;
        };
        let flags = meta.st_flags();
        if !meta.is_file() || flags & libc::UF_HIDDEN == 0 {
            return;
        }
        let Some(path) = c_path(path) else {
            return;
        };
        // SAFETY: the path is NUL-terminated and lives through the call.
        unsafe {
            libc::chflags(path.as_ptr(), flags & !libc::UF_HIDDEN);
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::macos::fs::MetadataExt;

    struct Folder(std::path::PathBuf);
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn hidden(path: &Path) -> bool {
        fs::metadata(path).unwrap().st_flags() & libc::UF_HIDDEN != 0
    }

    fn hide(path: &Path) {
        let c = mac_path(path);
        let flags = fs::metadata(path).unwrap().st_flags();
        // SAFETY: the path is NUL-terminated and lives through the call.
        assert_eq!(
            unsafe { libc::chflags(c.as_ptr(), flags | libc::UF_HIDDEN) },
            0
        );
    }

    fn mac_path(path: &Path) -> std::ffi::CString {
        use std::os::unix::ffi::OsStrExt;
        std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap()
    }

    #[test]
    fn takes_the_folder_out_of_icloud_and_shows_what_icloud_hid() {
        let folder =
            Folder(std::env::temp_dir().join(format!("unipilot-icloud-{}", std::process::id())));
        let sheets = folder.0.join("ILIAS/Übungen");
        fs::create_dir_all(&sheets).unwrap();
        let sheet = sheets.join("Blatt 1.pdf");
        let manifest = folder.0.join("ILIAS/.ilias-sync.json");
        fs::write(&sheet, "%PDF").unwrap();
        fs::write(&manifest, "{}").unwrap();
        hide(&sheet);
        hide(&manifest);

        let ilias = folder.0.join("ILIAS");
        assert!(!mac::is_kept(&ilias));
        keep_on_this_computer(&ilias);
        assert!(mac::is_kept(&ilias));
        assert!(!hidden(&sheet));
        // Hidden by name as well; not the sync's business to show.
        assert!(hidden(&manifest));

        // Once kept, the folder is not walked again.
        hide(&sheet);
        keep_on_this_computer(&ilias);
        assert!(hidden(&sheet));
        show(&sheet);
        assert!(!hidden(&sheet));
    }
}
