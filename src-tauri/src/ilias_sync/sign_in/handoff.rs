//! The sign-on Rust signed in to, handed to the webview.
//!
//! Spike 0.3 of `docs/face-unlock-plan.md` showed it on macOS: cookies set
//! from Rust land in the store the hidden sign-on window uses, and Keycloak
//! takes them — rebuilt fresh, with the sign-on's host as their domain. So the
//! sign-on's cookies go across, `hhn-login-bs` among them so the window reaches
//! the node that holds the session, and nothing of ILIAS's. Then
//! `reauth::renew` opens ILIAS's OIDC entry in that window; the sign-on
//! remembers the student now, and ILIAS makes its session the usual way.

use tauri::webview::cookie::Cookie;
use tauri::{Manager, Url};

use super::jar::{Jar, Stored};
use super::SignInError;
use crate::ilias_sync::{reauth, SyncError};
use crate::ilias_view::MAIN;

/// The jar's cookies for the sign-on's host, rebuilt for the webview.
pub(super) fn cookies_for(jar: &Jar, sign_on: &Url) -> Vec<Cookie<'static>> {
    let Some(host) = sign_on.host_str() else {
        return Vec::new();
    };
    jar.reaching(host)
        .map(|stored| rebuild(stored, host))
        .collect()
}

fn rebuild(stored: &Stored, host: &str) -> Cookie<'static> {
    let mut cookie = Cookie::build((stored.name.clone(), stored.value.to_string()))
        .domain(host.to_owned())
        .path(stored.path.clone())
        .secure(stored.secure)
        .http_only(stored.http_only);
    if let Some(same_site) = stored.same_site {
        cookie = cookie.same_site(same_site);
    }
    if let Some(expires) = stored.expires {
        cookie = cookie.expires(expires);
    }
    cookie.build()
}

/// Gives the webview the sign-on's cookies, then lets ILIAS sign in through
/// it. `true` when ILIAS has a session again.
pub(super) async fn hand_off(
    app: &tauri::AppHandle,
    jar: &Jar,
    sign_on: &Url,
    base_url: &str,
    client_id: &str,
) -> Result<bool, SignInError> {
    // The ILIAS view, Uni Pilot's page and the hidden window share one store.
    let view = app.get_webview(MAIN).ok_or_else(|| {
        SignInError::Local("Uni Pilot has no window to hand the sign-in to.".into())
    })?;
    let cookies = cookies_for(jar, sign_on);
    eprintln!(
        "ILIAS sign-in: handing over [{}].",
        cookies
            .iter()
            .map(|cookie| cookie.name())
            .collect::<Vec<_>>()
            .join(", ")
    );
    for cookie in cookies {
        view.set_cookie(cookie).map_err(|error| {
            SignInError::Local(format!("The sign-in could not be handed to ILIAS: {error}"))
        })?;
    }
    reauth::renew(app, base_url, client_id)
        .await
        .map_err(|error| match error {
            SyncError::Unreachable(message) => SignInError::Unreachable(message),
            SyncError::Refused(message)
            | SyncError::Unrecognised(message)
            | SyncError::Local(message) => SignInError::Local(message),
            SyncError::SignedOut => SignInError::Local("ILIAS could not be asked.".into()),
        })
}

#[cfg(test)]
mod tests {
    use super::cookies_for;
    use crate::ilias_sync::sign_in::jar::Jar;
    use tauri::webview::cookie::SameSite;
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn hands_over_the_sign_ons_cookies_and_nothing_of_iliass() {
        let mut jar = Jar::default();
        jar.store(
            &url("https://login.hs-heilbronn.de/realms/hhn/login-actions/authenticate"),
            [
                "KEYCLOAK_IDENTITY=identity; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly",
                "KEYCLOAK_SESSION=hhn/student/x; Version=1; Max-Age=36000; Path=/realms/hhn/; SameSite=None; Secure",
                "hhn-login-bs=node1; path=/",
                "GONE=x; Max-Age=0; Path=/",
            ],
        );
        jar.store(
            &url("https://ilias.hs-heilbronn.de/openidconnect.php"),
            ["PHPSESSID=ilias; Path=/; Secure; HttpOnly"],
        );

        let cookies = cookies_for(&jar, &url("https://login.hs-heilbronn.de/realms/hhn"));
        let names: Vec<&str> = cookies.iter().map(|cookie| cookie.name()).collect();
        assert_eq!(
            names,
            ["KEYCLOAK_IDENTITY", "KEYCLOAK_SESSION", "hhn-login-bs"]
        );

        let identity = &cookies[0];
        assert_eq!(identity.value(), "identity");
        assert_eq!(identity.domain(), Some("login.hs-heilbronn.de"));
        assert_eq!(identity.path(), Some("/realms/hhn/"));
        assert_eq!(identity.secure(), Some(true));
        assert_eq!(identity.http_only(), Some(true));
        assert_eq!(identity.same_site(), Some(SameSite::None));
        assert_eq!(
            identity.expires_datetime(),
            None,
            "ends with the session, as at HHN"
        );

        assert!(
            cookies[1].expires_datetime().is_some(),
            "outlives the session"
        );
        let stickiness = &cookies[2];
        assert_eq!(stickiness.path(), Some("/"));
        assert_eq!(stickiness.secure(), Some(false));
        assert_eq!(stickiness.http_only(), Some(false));
    }
}
