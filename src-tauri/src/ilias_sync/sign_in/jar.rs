//! The cookies of one automatic sign-in, in memory, dropped after it.
//!
//! Keycloak keeps a sign-in's state in cookies from one page to the next:
//! `AUTH_SESSION_ID` and `KC_RESTART` under `/realms/<realm>/`,
//! `KC_AUTH_SESSION_HASH` for a minute, and at HHN `hhn-login-bs` for the whole
//! host — neither Secure nor HttpOnly, the load balancer's note of which node
//! holds the sign-in. Without it the password may reach a node that knows
//! nothing of the sign-in, so it is kept like any other. After the code,
//! `KEYCLOAK_IDENTITY` and `KEYCLOAK_SESSION` are the sign-on itself; `handoff`
//! gives them to the webview.
//!
//! As much of RFC 6265 as that needs: `Domain`, or the host alone without one;
//! `Path` and its default; `Secure`, `HttpOnly`, `SameSite`; `Max-Age` before
//! `Expires`. A cookie with the same name, domain and path replaces the one
//! before, and one that has expired removes it. There is no public-suffix
//! list: the sign-in only asks ILIAS and the sign-on (`keycloak::Hosts`), and a
//! `Domain` of a whole top-level domain is refused.
//!
//! Values leave the jar only in a `Cookie` header or through `handoff`; logs
//! carry names.

use std::net::IpAddr;

use tauri::webview::cookie::time::OffsetDateTime;
use tauri::webview::cookie::{Cookie, SameSite};
use tauri::Url;
use zeroize::Zeroizing;

use crate::ilias_sign_out::cookie_reaches;

pub(crate) struct Stored {
    pub(super) name: String,
    pub(super) value: Zeroizing<String>,
    /// Lower case, without a leading dot.
    pub(super) domain: String,
    /// Set without `Domain`: sent to that host only, not to its subdomains.
    host_only: bool,
    pub(super) path: String,
    pub(super) secure: bool,
    pub(super) http_only: bool,
    pub(super) same_site: Option<SameSite>,
    /// `None` for a cookie that lasts as long as the session.
    pub(super) expires: Option<OffsetDateTime>,
}

impl Stored {
    fn expired(&self, now: OffsetDateTime) -> bool {
        self.expires.is_some_and(|at| at <= now)
    }

    /// Whether a request to `host` carries this cookie, path aside.
    pub(super) fn reaches(&self, host: &str) -> bool {
        if self.host_only {
            host.eq_ignore_ascii_case(&self.domain)
        } else {
            cookie_reaches(&self.domain, host)
        }
    }

    fn goes_with(&self, url: &Url, now: OffsetDateTime) -> bool {
        url.host_str().is_some_and(|host| self.reaches(host))
            && path_matches(&self.path, url.path())
            && (!self.secure || secure_channel(url))
            && !self.expired(now)
    }
}

#[derive(Default)]
pub(crate) struct Jar {
    cookies: Vec<Stored>,
}

impl Jar {
    /// Keeps what the `Set-Cookie` headers of a response from `url` set.
    /// Returns the names kept, for the log.
    pub(super) fn store<'h>(
        &mut self,
        url: &Url,
        set_cookies: impl IntoIterator<Item = &'h str>,
    ) -> Vec<String> {
        let now = OffsetDateTime::now_utc();
        set_cookies
            .into_iter()
            .filter_map(|header| self.store_one(url, header, now))
            .collect()
    }

    fn store_one(&mut self, url: &Url, header: &str, now: OffsetDateTime) -> Option<String> {
        let host = url.host_str()?.to_ascii_lowercase();
        let parsed = Cookie::parse(header).ok()?;

        let (domain, host_only) = match parsed
            .domain()
            .map(|domain| domain.trim_start_matches('.').to_ascii_lowercase())
            .filter(|domain| !domain.is_empty())
        {
            // A cookie for another site, or for a whole top-level domain, is not kept.
            Some(domain) if !cookie_reaches(&domain, &host) => return None,
            Some(domain) if !domain.contains('.') && domain != host => return None,
            Some(domain) => (domain, false),
            None => (host, true),
        };
        let path = parsed
            .path()
            .filter(|path| path.starts_with('/'))
            .map_or_else(|| default_path(url), str::to_owned);
        let secure = parsed.secure().unwrap_or(false);
        if secure && !secure_channel(url) {
            return None;
        }
        let expires = match (parsed.max_age(), parsed.expires_datetime()) {
            (Some(max_age), _) => Some(now + max_age),
            (None, at) => at,
        };

        let stored = Stored {
            name: parsed.name().to_owned(),
            value: Zeroizing::new(parsed.value().to_owned()),
            domain,
            host_only,
            path,
            secure,
            http_only: parsed.http_only().unwrap_or(false),
            same_site: parsed.same_site(),
            expires,
        };
        let before = self.cookies.iter().position(|cookie| {
            cookie.name == stored.name
                && cookie.domain == stored.domain
                && cookie.path == stored.path
        });
        if stored.expired(now) {
            // Max-Age=0 or an Expires in the past: Keycloak taking a cookie back.
            if let Some(at) = before {
                self.cookies.remove(at);
            }
            return None;
        }
        let name = stored.name.clone();
        match before {
            Some(at) => self.cookies[at] = stored,
            None => self.cookies.push(stored),
        }
        Some(name)
    }

    /// The `Cookie` header for a request to `url`, longer paths first as
    /// browsers send them. `None` when no cookie goes there.
    pub(super) fn header(&self, url: &Url) -> Option<Zeroizing<String>> {
        self.header_at(url, OffsetDateTime::now_utc())
    }

    fn header_at(&self, url: &Url, now: OffsetDateTime) -> Option<Zeroizing<String>> {
        let mut going: Vec<&Stored> = self
            .cookies
            .iter()
            .filter(|cookie| cookie.goes_with(url, now))
            .collect();
        if going.is_empty() {
            return None;
        }
        going.sort_by_key(|cookie| std::cmp::Reverse(cookie.path.len()));
        let mut header = Zeroizing::new(String::with_capacity(
            going
                .iter()
                .map(|cookie| cookie.name.len() + cookie.value.len() + 3)
                .sum(),
        ));
        for cookie in going {
            if !header.is_empty() {
                header.push_str("; ");
            }
            header.push_str(&cookie.name);
            header.push('=');
            header.push_str(&cookie.value);
        }
        Some(header)
    }

    /// The cookies still valid that a request to `host` would carry, on any path.
    pub(super) fn reaching<'j>(&'j self, host: &'j str) -> impl Iterator<Item = &'j Stored> {
        let now = OffsetDateTime::now_utc();
        self.cookies
            .iter()
            .filter(move |cookie| cookie.reaches(host) && !cookie.expired(now))
    }
}

/// Whether `url` may carry Secure cookies: HTTPS, or this computer itself, as
/// browsers treat it — which lets a local server stand in for the sign-on in
/// tests.
pub(super) fn secure_channel(url: &Url) -> bool {
    if url.scheme() == "https" {
        return true;
    }
    match url.host_str() {
        Some("localhost") => true,
        Some(host) => host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
            .is_ok_and(|ip| ip.is_loopback()),
        None => false,
    }
}

/// RFC 6265 §5.1.4: the directory of the request's path.
fn default_path(url: &Url) -> String {
    let path = url.path();
    match path.rfind('/') {
        Some(0) | None => "/".into(),
        Some(at) => path[..at].into(),
    }
}

/// RFC 6265 §5.1.4: `/realms/hhn/` covers `/realms/hhn/login-actions/…` but
/// not `/realms/hhnx/`.
fn path_matches(cookie_path: &str, request_path: &str) -> bool {
    request_path == cookie_path
        || (request_path.starts_with(cookie_path)
            && (cookie_path.ends_with('/') || request_path[cookie_path.len()..].starts_with('/')))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::webview::cookie::time::Duration;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    fn page() -> Url {
        url("https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth?client_id=x")
    }

    fn now() -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_790_000_000).unwrap()
    }

    fn jar(set_cookies: &[&str]) -> Jar {
        let mut jar = Jar::default();
        for header in set_cookies {
            jar.store_one(&page(), header, now());
        }
        jar
    }

    fn sent(jar: &Jar, to: &str) -> String {
        jar.header_at(&url(to), now())
            .map(|header| header.to_string())
            .unwrap_or_default()
    }

    /// The four cookies HHN's password page set on 03.10.2026, values made up.
    const HHN: [&str; 4] = [
        "AUTH_SESSION_ID=abc.node1; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly",
        "KC_RESTART=restart; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly",
        "KC_AUTH_SESSION_HASH=hash; Max-Age=60; Path=/realms/hhn/; SameSite=None; Secure",
        "hhn-login-bs=node1; path=/",
    ];

    #[test]
    fn reads_keycloaks_cookies_with_their_attributes() {
        let jar = jar(&HHN);
        let session = &jar.cookies[0];
        assert_eq!(session.name, "AUTH_SESSION_ID");
        assert_eq!(session.value.as_str(), "abc.node1");
        assert_eq!(session.domain, "login.hs-heilbronn.de");
        assert!(session.host_only);
        assert_eq!(session.path, "/realms/hhn/");
        assert!(session.secure && session.http_only);
        assert_eq!(session.same_site, Some(SameSite::None));
        assert_eq!(session.expires, None, "a session cookie");

        let hash = &jar.cookies[2];
        assert_eq!(hash.expires, Some(now() + Duration::seconds(60)));
        assert!(!hash.http_only);
    }

    /// The load balancer's cookie is neither Secure nor HttpOnly and lives on
    /// `/`. Dropping it would send the password to a node that knows nothing.
    #[test]
    fn keeps_the_load_balancers_cookie() {
        let jar = jar(&HHN);
        let stickiness = jar
            .cookies
            .iter()
            .find(|c| c.name == "hhn-login-bs")
            .unwrap();
        assert_eq!(stickiness.path, "/");
        assert!(!stickiness.secure && !stickiness.http_only);
        assert_eq!(
            sent(&jar, "https://login.hs-heilbronn.de/realms/hhn/login-actions/authenticate?session_code=x"),
            "AUTH_SESSION_ID=abc.node1; KC_RESTART=restart; KC_AUTH_SESSION_HASH=hash; hhn-login-bs=node1"
        );
    }

    #[test]
    fn sends_a_cookie_only_under_its_path() {
        let jar = jar(&HHN);
        for elsewhere in [
            "https://login.hs-heilbronn.de/",
            "https://login.hs-heilbronn.de/realms/hhnx/login-actions/authenticate",
            "https://login.hs-heilbronn.de/realms/other/login-actions/authenticate",
            "https://login.hs-heilbronn.de/realms/hhn",
        ] {
            assert_eq!(sent(&jar, elsewhere), "hhn-login-bs=node1", "{elsewhere}");
        }
        assert!(path_matches("/realms/hhn", "/realms/hhn/x"));
        assert!(!path_matches("/realms/hhn", "/realms/hhnx"));
    }

    #[test]
    fn sends_a_cookie_only_to_its_host() {
        let jar = jar(&[
            "host=1; Path=/",
            "domain=2; Domain=.hs-heilbronn.de; Path=/",
        ]);
        assert_eq!(
            sent(&jar, "https://login.hs-heilbronn.de/"),
            "host=1; domain=2"
        );
        assert_eq!(sent(&jar, "https://ilias.hs-heilbronn.de/"), "domain=2");
        // Without a Domain, not even a subdomain gets it.
        assert_eq!(sent(&jar, "https://www.login.hs-heilbronn.de/"), "domain=2");
        assert_eq!(sent(&jar, "https://evil.example/"), "");
    }

    #[test]
    fn refuses_a_cookie_for_another_site() {
        let jar = jar(&[
            "foreign=1; Domain=evil.example",
            "sibling=2; Domain=ilias.hs-heilbronn.de",
            "everyone=3; Domain=de",
        ]);
        assert!(jar.cookies.is_empty());
    }

    #[test]
    fn keeps_secure_cookies_off_plain_http() {
        let jar = jar(&HHN);
        assert_eq!(
            sent(
                &jar,
                "http://login.hs-heilbronn.de/realms/hhn/login-actions/authenticate"
            ),
            "hhn-login-bs=node1"
        );

        let mut plain = Jar::default();
        let insecure = url("http://login.hs-heilbronn.de/realms/hhn/");
        assert_eq!(plain.store_one(&insecure, HHN[0], now()), None);
    }

    /// This computer counts as secure, as in browsers: the tests' local
    /// servers get Keycloak's Secure cookies back.
    #[test]
    fn counts_this_computer_as_secure() {
        assert!(secure_channel(&url("http://127.0.0.1:8080/")));
        assert!(secure_channel(&url("http://localhost/")));
        assert!(secure_channel(&url("http://[::1]:8080/")));
        assert!(!secure_channel(&url("http://login.hs-heilbronn.de/")));
        assert!(!secure_channel(&url("http://10.0.0.1/")));
    }

    #[test]
    fn drops_a_cookie_once_it_expires() {
        let jar = jar(&HHN);
        let to = url("https://login.hs-heilbronn.de/realms/hhn/x");
        let later = |seconds| {
            jar.header_at(&to, now() + Duration::seconds(seconds))
                .unwrap()
        };
        assert!(later(59).contains("KC_AUTH_SESSION_HASH"));
        assert!(!later(60).contains("KC_AUTH_SESSION_HASH"));
    }

    #[test]
    fn prefers_max_age_to_expires() {
        let jar = jar(&["both=1; Max-Age=10; Expires=Wed, 21 Oct 2099 07:28:00 GMT"]);
        assert_eq!(jar.cookies[0].expires, Some(now() + Duration::seconds(10)));
    }

    #[test]
    fn replaces_and_takes_back_cookies() {
        let mut jar = jar(&HHN);
        jar.store_one(
            &page(),
            "KC_RESTART=newer; Path=/realms/hhn/; Secure",
            now(),
        );
        assert_eq!(
            jar.cookies
                .iter()
                .filter(|c| c.name == "KC_RESTART")
                .count(),
            1
        );
        assert!(
            sent(&jar, "https://login.hs-heilbronn.de/realms/hhn/").contains("KC_RESTART=newer")
        );

        jar.store_one(
            &page(),
            "KC_RESTART=; Max-Age=0; Path=/realms/hhn/; Secure",
            now(),
        );
        jar.store_one(
            &page(),
            "hhn-login-bs=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
            now(),
        );
        let left: Vec<&str> = jar.cookies.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(left, ["AUTH_SESSION_ID", "KC_AUTH_SESSION_HASH"]);
    }

    /// Same name, other path: two cookies, as in a browser.
    #[test]
    fn keeps_a_name_apart_by_path() {
        let jar = jar(&["n=root; Path=/", "n=realm; Path=/realms/hhn/"]);
        assert_eq!(
            sent(&jar, "https://login.hs-heilbronn.de/realms/hhn/x"),
            "n=realm; n=root"
        );
    }

    #[test]
    fn defaults_the_path_to_the_requests_directory() {
        let jar = jar(&["implicit=1"]);
        assert_eq!(jar.cookies[0].path, "/realms/hhn/protocol/openid-connect");
        assert_eq!(default_path(&url("https://login.hs-heilbronn.de/x")), "/");
    }

    #[test]
    fn has_nothing_to_send_when_empty() {
        assert!(Jar::default().header(&page()).is_none());
    }
}
