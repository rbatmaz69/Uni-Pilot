//! What the sync may ask ILIAS for: an allow-list, never a crawl.
//!
//! ILIAS puts account actions right next to harmless links, as plain GET and
//! without a token. Seen at HHN on 25.09.2026 (ILIAS 9.23):
//!
//! | Where               | Link                                   | Does                       |
//! | ------------------- | -------------------------------------- | -------------------------- |
//! | membership list     | `ilias.php?…&cmd=leave&ref_id=…`       | leaves the course          |
//! | a course's tabs     | `…ilObjCourseGUI&cmd=unsubscribe&…`    | leaves the course          |
//! | a file's own title  | `…ilObjFileGUI&cmd=sendfile&ref_id=…`  | downloads it, a read event |
//! | a folder's menu     | `ilias.php?…&cmd=download&ref_id=…`    | zips the whole folder      |
//! | nearly every item   | `…&cmd=addToDesk&…`                    | adds a favourite           |
//!
//! A crawler that followed what it found could take a student out of a
//! course, or tick every file off in the learning progress a lecturer sees.
//! So the sync follows nothing. It names each page itself (`Page`), and every
//! address — redirects included — passes `may_fetch` before a request leaves.

use serde::Deserialize;
use tauri::Url;

use crate::ilias_window::{installation_page, resolve_target};

/// The commands a sync request may carry: the ones that show a page. Anything
/// else is refused, the ones in the table above among them.
const SHOWING_COMMANDS: [&str; 3] = ["view", "render", "showoverview"];

/// The containers the sync reads the contents of.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Crs,
    Grp,
    Fold,
}

impl Container {
    fn as_str(self) -> &'static str {
        match self {
            Container::Crs => "crs",
            Container::Grp => "grp",
            Container::Fold => "fold",
        }
    }
}

/// Every page the sync knows how to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    /// "Meine Kurse und Gruppen". Not `jumpToMemberships`: in ILIAS 9 that
    /// lands on the dashboard, which at HHN shows no course list.
    Memberships,
    /// A course, group or folder, through `goto.php` — which every ILIAS
    /// understands, unlike the `/go/…` short links an installation has to
    /// switch on.
    Contents(Container, u64),
    /// An exercise's assignments, all of them. Without `mode=all` ILIAS shows
    /// only running ones, and past deadlines and submissions go missing.
    Assignments(u64),
    /// A file's download — the one page that counts as reading in ILIAS. Only
    /// the student's own click asks for it (`ilias_sync_download`); the sync
    /// never does, and `may_fetch` refuses it.
    File(u64),
}

impl Page {
    pub fn url(self, base_url: &str, client_id: &str) -> Result<Url, String> {
        match self {
            Page::Memberships => installation_page(
                base_url,
                client_id,
                "ilias.php",
                &[("baseClass", "ilmembershipoverviewgui")],
            ),
            Page::Contents(kind, ref_id) => {
                let target = format!("{}_{ref_id}", kind.as_str());
                resolve_target(base_url, client_id, Some(&target))
            }
            Page::Assignments(ref_id) => {
                let ref_id = ref_id.to_string();
                installation_page(
                    base_url,
                    client_id,
                    "ilias.php",
                    &[
                        ("baseClass", "ilexercisehandlergui"),
                        ("cmdClass", "ilObjExerciseGUI"),
                        ("cmd", "showOverview"),
                        ("ref_id", &ref_id),
                        ("mode", "all"),
                    ],
                )
            }
            // The address of a file's own title link at HHN, less the cmdNode.
            Page::File(ref_id) => {
                let ref_id = ref_id.to_string();
                installation_page(
                    base_url,
                    client_id,
                    "ilias.php",
                    &[
                        ("baseClass", "ilrepositorygui"),
                        ("cmdClass", "ilObjFileGUI"),
                        ("cmd", "sendfile"),
                        ("ref_id", &ref_id),
                    ],
                )
            }
        }
    }
}

/// A `ref_id` as the page sends it: digits, nothing else.
pub fn ref_id(value: &str) -> Result<u64, String> {
    let valid = !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit());
    match value.parse() {
        Ok(id) if valid && id > 0 => Ok(id),
        _ => Err("That is not an ILIAS object.".into()),
    }
}

/// Whether the sync may send a request to `url`: ILIAS's own origin, a page
/// that only shows something, and nothing that carries a token.
pub fn may_fetch(url: &Url, home: &Url) -> bool {
    if url.scheme() != "https" || url.origin() != home.origin() {
        return false;
    }
    let page = url.path().rsplit('/').next().unwrap_or_default();
    if page != "ilias.php" && page != "goto.php" {
        return false;
    }
    url.query_pairs().all(|(key, value)| match key.as_ref() {
        "rtoken" => false,
        "cmd" => SHOWING_COMMANDS.contains(&value.to_ascii_lowercase().as_str()),
        _ => true,
    })
}

/// Whether a download may go to `url`, redirects included: ILIAS's own origin,
/// nothing but `sendfile`, no token, and never the sign-in — landing there
/// means the student is signed out, and the download stops to say so.
pub fn may_download(url: &Url, home: &Url) -> bool {
    if url.scheme() != "https" || url.origin() != home.origin() {
        return false;
    }
    let page = url.path().rsplit('/').next().unwrap_or_default();
    if matches!(page, "login.php" | "logout.php" | "openidconnect.php") {
        return false;
    }
    url.query_pairs().all(|(key, value)| match key.as_ref() {
        "rtoken" => false,
        "cmd" => value.eq_ignore_ascii_case("sendfile"),
        _ => true,
    })
}

#[cfg(test)]
mod tests {
    use super::{may_download, may_fetch, ref_id, Container, Page};
    use tauri::Url;

    const BASE: &str = "https://ilias.hs-heilbronn.de";
    const CLIENT: &str = "iliashhn";

    fn home() -> Url {
        Url::parse(BASE).unwrap()
    }

    fn allowed(link: &str) -> bool {
        may_fetch(&Url::parse(link).unwrap(), &home())
    }

    #[test]
    fn names_the_membership_list() {
        assert_eq!(
            Page::Memberships.url(BASE, CLIENT).unwrap().as_str(),
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilmembershipoverviewgui&client_id=iliashhn"
        );
    }

    #[test]
    fn reaches_a_course_or_folder_through_goto() {
        assert_eq!(
            Page::Contents(Container::Crs, 967849)
                .url(BASE, CLIENT)
                .unwrap()
                .as_str(),
            "https://ilias.hs-heilbronn.de/goto.php?target=crs_967849&client_id=iliashhn"
        );
        assert_eq!(
            Page::Contents(Container::Fold, 42)
                .url(BASE, CLIENT)
                .unwrap()
                .as_str(),
            "https://ilias.hs-heilbronn.de/goto.php?target=fold_42&client_id=iliashhn"
        );
    }

    #[test]
    fn asks_for_every_assignment_not_just_running_ones() {
        let url = Page::Assignments(995478).url(BASE, CLIENT).unwrap();
        assert!(url
            .as_str()
            .contains("cmd=showOverview&ref_id=995478&mode=all"));
    }

    #[test]
    fn allows_every_page_it_names_and_where_ilias_sends_those() {
        for page in [
            Page::Memberships,
            Page::Contents(Container::Crs, 1),
            Page::Contents(Container::Grp, 1),
            Page::Contents(Container::Fold, 1),
            Page::Assignments(1),
        ] {
            let url = page.url(BASE, CLIENT).unwrap();
            assert!(may_fetch(&url, &home()), "{url}");
        }
        // Where goto.php redirects a course or folder at HHN.
        assert!(allowed(
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&ref_id=967849"
        ));
        assert!(allowed("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmdNode=102:o7&cmdClass=ilObjCourseGUI&cmd=view&ref_id=967849"));
    }

    /// Each of these was on an HHN page next to a link the sync does want.
    #[test]
    fn refuses_the_links_that_change_something_or_count_as_reading() {
        for link in [
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=leave&ref_id=967849",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjCourseGUI&cmd=unsubscribe&ref_id=967849",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmdNode=102:oz&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=967852",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=download&ref_id=967853",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjFolderGUI&cmd=addToDesk&ref_id=967851&type=file&item_ref_id=967852",
            "https://ilias.hs-heilbronn.de/logout.php?baseClass=ilstartupgui&cmd=doLogout&rtoken=0123abcd",
        ] {
            assert!(!allowed(link), "{link}");
        }
    }

    #[test]
    fn refuses_anything_that_carries_a_token() {
        assert!(!allowed("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=view&ref_id=1&rtoken=abc"));
    }

    #[test]
    fn refuses_other_sites_pages_and_schemes() {
        for link in [
            "https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth",
            "http://ilias.hs-heilbronn.de/ilias.php?baseClass=ilmembershipoverviewgui",
            "https://ilias.hs-heilbronn.de/login.php?cmd=force_login",
            "https://ilias.hs-heilbronn.de/webdav.php/iliashhn/",
            "https://ilias.hs-heilbronn.de/go/crs/967849",
        ] {
            assert!(!allowed(link), "{link}");
        }
    }

    #[test]
    fn downloads_a_file_the_way_its_title_link_does() {
        let url = Page::File(967852).url(BASE, CLIENT).unwrap();
        assert_eq!(
            url.as_str(),
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=967852&client_id=iliashhn"
        );
        assert!(may_download(&url, &home()));
    }

    /// A download counts as reading: the sync must never be able to ask for one.
    #[test]
    fn keeps_downloads_out_of_the_sync() {
        let url = Page::File(967852).url(BASE, CLIENT).unwrap();
        assert!(!may_fetch(&url, &home()));
    }

    #[test]
    fn lets_a_download_go_nowhere_else() {
        for link in [
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=leave&ref_id=1",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=download&ref_id=1",
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=sendfile&ref_id=1&rtoken=abc",
            "https://ilias.hs-heilbronn.de/login.php?target=file_1&cmd=force_login",
            "https://ilias.hs-heilbronn.de/login.php?target=file_1",
            "https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth",
            "http://ilias.hs-heilbronn.de/ilias.php?cmd=sendfile&ref_id=1",
        ] {
            assert!(!may_download(&Url::parse(link).unwrap(), &home()), "{link}");
        }
    }

    #[test]
    fn takes_only_digits_for_an_object() {
        assert_eq!(ref_id("967849"), Ok(967849));
        for value in ["", "0", "12a", "-1", "1 ", "1&cmd=leave"] {
            assert!(ref_id(value).is_err(), "{value:?}");
        }
    }
}
