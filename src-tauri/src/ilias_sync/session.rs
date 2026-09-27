//! Telling a signed-in answer from a signed-out one.
//!
//! ILIAS rarely says 401. Signed out, it sends the student to its login page
//! (`login.php?cmd=force_login`), to the public repository (`reloadpublic=1`),
//! or through single sign-on to the university's own sign-in — and answers
//! 200 wherever it lands. Trusting the status would read a signed-out page as
//! an empty course list: "nothing new", when nothing was looked at.
//!
//! Every page ILIAS 9 serves to someone signed in carries the sign-out link of
//! its user menu, with the token only a session has (`logout.php?…
//! cmd=doLogout&rtoken=…`). At HHN on 25.09.2026 it was on the dashboard, the
//! membership list, a course, a folder and an exercise. So a page counts as
//! signed in when, and only when, it has that link.

use tauri::Url;

use crate::ilias_sign_out::find_sign_out_link;

/// Whether ILIAS answered `url` with `html` as it would to someone signed in.
pub fn signed_in(url: &Url, html: &str) -> bool {
    let page = url.path().rsplit('/').next().unwrap_or_default();
    let bounced = page == "login.php"
        || url.query_pairs().any(|(key, value)| {
            (key == "cmd" && value == "force_login") || (key == "reloadpublic" && value == "1")
        });
    !bounced && find_sign_out_link(html, url).is_some()
}

/// Whether a redirect the sync did not follow was ILIAS sending the student to
/// sign in: to its login page, to its OIDC entry, or to another site — the
/// university's sign-in, at HHN `login.hs-heilbronn.de`.
pub fn wants_sign_in(location: &Url, home: &Url) -> bool {
    if location.origin() != home.origin() {
        return true;
    }
    let page = location.path().rsplit('/').next().unwrap_or_default();
    matches!(page, "login.php" | "openidconnect.php")
        || location
            .query_pairs()
            .any(|(key, value)| key == "cmd" && value == "force_login")
}

#[cfg(test)]
mod tests {
    use super::{signed_in, wants_sign_in};
    use tauri::Url;

    const SIGNED_IN: &str = include_str!("fixtures/memberships.html");

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    fn home() -> Url {
        url("https://ilias.hs-heilbronn.de/")
    }

    #[test]
    fn knows_a_page_served_to_someone_signed_in() {
        let page = url("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilmembershipoverviewgui");
        assert!(signed_in(&page, SIGNED_IN));
    }

    /// The HHN login page as it looked on 25.09.2026, trimmed.
    #[test]
    fn knows_the_login_page() {
        let html = r#"<title>Bei ILIAS anmelden: HHN ILIAS</title>
            <a href="https://ilias.hs-heilbronn.de/openidconnect.php">Login</a>
            <form action="ilias.php?baseClass=ilstartupgui&amp;cmd=post&amp;fallbackCmd=doStandardAuthentication" method="post"></form>"#;
        let page = url("https://ilias.hs-heilbronn.de/login.php?cmd=force_login");
        assert!(!signed_in(&page, html));
    }

    #[test]
    fn distrusts_a_public_page_even_when_it_answered_200() {
        let page = url("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&reloadpublic=1&ref_id=1");
        assert!(!signed_in(&page, SIGNED_IN));
    }

    #[test]
    fn distrusts_a_page_without_the_sign_out_link() {
        let page =
            url("https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&ref_id=1");
        let html = r#"<a href="login.php?cmd=force_login&amp;client_id=iliashhn">Anmelden</a>"#;
        assert!(!signed_in(&page, html));
    }

    #[test]
    fn reads_a_redirect_to_the_sign_in_as_signed_out() {
        for location in [
            "https://ilias.hs-heilbronn.de/login.php?target=crs_1&cmd=force_login",
            "https://ilias.hs-heilbronn.de/openidconnect.php",
            "https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth?client_id=hhn_common_ilias",
        ] {
            assert!(wants_sign_in(&url(location), &home()), "{location}");
        }
    }

    #[test]
    fn does_not_read_every_stopped_redirect_as_signed_out() {
        let refused = url(
            "https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&cmd=leave&ref_id=1",
        );
        assert!(!wants_sign_in(&refused, &home()));
    }
}
