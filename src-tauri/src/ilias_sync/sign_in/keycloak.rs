//! The university's sign-on — Keycloak at HHN — over HTTP.
//!
//! The way in, as recorded at HHN on 03.10.2026 (`../fixtures/keycloak-*.html`):
//!
//! 1. GET ILIAS's `openidconnect.php`. ILIAS answers with one redirect to the
//!    sign-on, carrying its `state`; the sign-on answers with the password form.
//! 2. POST user name and password to that form. Keycloak answers with the code
//!    form itself — no redirect in between.
//! 3. POST the code Uni Pilot's authenticator shows at that moment. Keycloak
//!    sets its sign-on cookies and redirects back to ILIAS. The sign-in stops
//!    there and does not follow: ILIAS keeps its `state` with the webview, not
//!    here, and `handoff` lets the webview come back the way it always does.
//!
//! Pages are told apart by their form ids alone — `#kc-form-login`,
//! `#kc-otp-login-form`, `#kc-select-credential-form` — never by their words:
//! Keycloak answers in German or English depending on who asks, and HHN may
//! reword anything. A form counts only if it posts to the realm's own
//! `login-actions` on the sign-on. The language links point there as well, so
//! the action is read from the form, never from the first link that fits.
//!
//! Requests go to ILIAS's origin and the sign-on's, and the sign-on is known
//! beforehand, never taken from a page. Each POST is sent at most once: not
//! again after a refusal, not again through a redirect. Whatever comes back
//! that is not the next page expected ends the sign-in before anything more
//! is sent. The status decides nothing but redirects and trouble — Keycloak
//! may show a refused password with a 4xx.

use std::time::Duration;

use scraper::{ElementRef, Html, Selector};
use tauri::Url;
use tauri_plugin_http::reqwest::{self, header, redirect, StatusCode};

use super::jar::{secure_channel, Jar};
use super::SignInError;
use crate::ilias_sync::fetch::USER_AGENT;
use crate::ilias_sync::squash;
use crate::vault::{self, Credentials};

const TIMEOUT: Duration = Duration::from_secs(20);
/// ILIAS to the sign-on is one hop at HHN; a few more for a detour, fewer than a loop.
const REDIRECT_LIMIT: usize = 5;

const PASSWORD_FORM: &str = "kc-form-login";
const CODE_FORM: &str = "kc-otp-login-form";
/// "Try another way": Uni Pilot never chooses a method.
const METHOD_FORM: &str = "kc-select-credential-form";

/// The two places a sign-in may talk to.
pub(crate) struct Hosts {
    /// ILIAS's `openidconnect.php`. Its origin is ILIAS.
    entry: Url,
    /// The realm at the sign-on, `https://login.hs-heilbronn.de/realms/hhn` at HHN.
    sign_on: Url,
    /// `/realms/<realm>/`.
    realm: String,
}

impl Hosts {
    /// `realm` is the installation's known sign-on, never an address read
    /// from a page. Both have to be HTTPS — a password goes there.
    pub(crate) fn new(entry: Url, realm: Url) -> Result<Self, SignInError> {
        let segments: Vec<&str> = realm
            .path_segments()
            .map(|segments| segments.filter(|segment| !segment.is_empty()).collect())
            .unwrap_or_default();
        let ["realms", name] = segments.as_slice() else {
            return Err(SignInError::Local(
                "The sign-on's address names no realm.".into(),
            ));
        };
        if !secure_channel(&realm) || !secure_channel(&entry) {
            return Err(SignInError::Local(
                "Uni Pilot signs in over HTTPS only.".into(),
            ));
        }
        if realm.origin() == entry.origin() {
            return Err(SignInError::Local(
                "ILIAS and its sign-on share an address; Uni Pilot could not tell them apart."
                    .into(),
            ));
        }
        Ok(Self {
            realm: format!("/realms/{name}/"),
            sign_on: realm,
            entry,
        })
    }

    pub(super) fn sign_on(&self) -> &Url {
        &self.sign_on
    }

    fn at_ilias(&self, url: &Url) -> bool {
        url.origin() == self.entry.origin()
    }

    fn at_sign_on(&self, url: &Url) -> bool {
        url.origin() == self.sign_on.origin() && url.path().starts_with(&self.realm)
    }

    fn may_post_to(&self, url: &Url) -> bool {
        url.origin() == self.sign_on.origin()
            && url
                .path()
                .strip_prefix(&self.realm)
                .is_some_and(|rest| rest.starts_with("login-actions/"))
    }

    /// What answered at `url`: the page `html`, or for a redirect the place
    /// it points to, with no page.
    pub(crate) fn classify(&self, url: &Url, html: &str) -> Page {
        if self.at_ilias(url) {
            return Page::BackToIlias;
        }
        if !self.at_sign_on(url) {
            return Page::Unknown;
        }
        let page = Html::parse_document(html);
        let known = selector(&format!(
            "form#{PASSWORD_FORM}, form#{CODE_FORM}, form#{METHOD_FORM}"
        ));
        let forms: Vec<ElementRef> = page.select(&known).collect();
        // None of them, or more than one: not a page to answer.
        let [form] = forms.as_slice() else {
            return Page::Unknown;
        };
        let element = form.value();
        let action = element
            .attr("action")
            .and_then(|action| url.join(action).ok())
            .filter(|action| self.may_post_to(action));
        let posts = element
            .attr("method")
            .is_some_and(|method| method.eq_ignore_ascii_case("post"));
        let (Some(action), true) = (action, posts) else {
            return Page::Unknown;
        };
        match element.id() {
            Some(PASSWORD_FORM)
                if form
                    .select(&selector(r#"[id^="input-error"]"#))
                    .next()
                    .is_some() =>
            {
                Page::Error
            }
            Some(PASSWORD_FORM) => Page::Login { action },
            Some(CODE_FORM) => Page::Otp {
                action,
                authenticators: authenticators(&page, *form),
            },
            _ => Page::Unknown,
        }
    }
}

/// A page of the sign-in, by what it lets Uni Pilot do next.
#[derive(Debug, PartialEq)]
pub(crate) enum Page {
    /// The password form; `action` is where it posts.
    Login { action: Url },
    /// The code form, with the authenticators it lists — none when the
    /// account has only one.
    Otp {
        action: Url,
        authenticators: Vec<Authenticator>,
    },
    /// The password form again, with Keycloak's message under the fields: a
    /// wrong user name or password, or an account locked for a while —
    /// Keycloak words all three alike.
    Error,
    /// On the way back to ILIAS: signed in at the sign-on.
    BackToIlias,
    /// Anything else, a form posting elsewhere among it. Nothing is sent to it.
    Unknown,
}

impl Page {
    fn kind(&self) -> &'static str {
        match self {
            Page::Login { .. } => "password form",
            Page::Otp { .. } => "code form",
            Page::Error => "password form with an error",
            Page::BackToIlias => "redirect back to ILIAS",
            Page::Unknown => "page Uni Pilot does not know",
        }
    }
}

/// One authenticator the code form offers, as a radio labelled with the name
/// it got when it was set up.
#[derive(Debug, PartialEq)]
pub(crate) struct Authenticator {
    /// What the form sends as `selectedCredentialId`.
    id: String,
    label: String,
    /// Keycloak's own choice. Never used to choose.
    checked: bool,
}

fn selector(css: &str) -> Selector {
    Selector::parse(css).expect("a valid selector")
}

fn authenticators(page: &Html, form: ElementRef) -> Vec<Authenticator> {
    let radios = selector(r#"input[type="radio"][name="selectedCredentialId"]"#);
    let labels = selector("label[for]");
    form.select(&radios)
        .filter_map(|radio| {
            let id = radio.value().attr("value")?.to_owned();
            let label = radio
                .value()
                .id()
                .and_then(|input| {
                    page.select(&labels)
                        .find(|label| label.value().attr("for") == Some(input))
                })
                .map(|label| squash(&label.text().collect::<String>()))
                .unwrap_or_default();
            Some(Authenticator {
                id,
                label,
                checked: radio.value().attr("checked").is_some(),
            })
        })
        .collect()
}

/// Which authenticator the code is for.
#[derive(Debug, PartialEq)]
enum Recipient<'a> {
    /// The form lists none: the account has one authenticator, and the code
    /// goes to it, without `selectedCredentialId`, as from a browser.
    TheOnlyOne,
    /// The one listed under Uni Pilot's name.
    Listed(&'a Authenticator),
}

/// Who gets the code. Without a list, the account's only authenticator. With
/// one, the authenticator named like Uni Pilot's, wherever Keycloak put its
/// check — that is its own choice, the student's phone as often as not.
/// `None` when the list has no such name, or has it twice: then no code is sent.
fn recipient<'a>(authenticators: &'a [Authenticator], device: &str) -> Option<Recipient<'a>> {
    if authenticators.is_empty() {
        return Some(Recipient::TheOnlyOne);
    }
    let device = squash(device);
    let mut named = authenticators
        .iter()
        .filter(|offered| offered.label == device);
    match (named.next(), named.next()) {
        (Some(one), None) => Some(Recipient::Listed(one)),
        _ => None,
    }
}

/// Signs in to the sign-on with the student's values: the password once, the
/// code once, no retries. Returns the jar holding the sign-on's cookies, for
/// `handoff`.
pub(crate) async fn sign_in(hosts: &Hosts, credentials: &Credentials) -> Result<Jar, SignInError> {
    // A broken authenticator shows before the password is sent, not after.
    vault::code(&credentials.otpauth).map_err(|_| no_code())?;
    let client = reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .connect_timeout(TIMEOUT)
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| {
            SignInError::Unreachable(format!("The sign-on could not be asked: {error}"))
        })?;
    let mut flow = Flow {
        client,
        hosts,
        jar: Jar::default(),
    };

    let action = match flow.visit(hosts.entry.clone(), None).await? {
        Page::Login { action } => action,
        other => return Err(stopped("on the way to the password form", &other)),
    };

    let password = [
        ("username", credentials.username.as_str()),
        ("password", credentials.password.as_str()),
        ("credentialId", ""),
    ];
    let (action, authenticators) = match flow.visit(action, Some(&password)).await? {
        Page::Otp {
            action,
            authenticators,
        } => (action, authenticators),
        Page::Error => return Err(SignInError::WrongPassword),
        // An account without a second factor is signed in already.
        Page::BackToIlias => return Ok(flow.jar),
        other => return Err(stopped("after the password", &other)),
    };

    let Some(recipient) = recipient(&authenticators, &credentials.device) else {
        return Err(SignInError::Unrecognised(format!(
            "HHN's code page does not list Uni Pilot's authenticator, \"{}\". Uni Pilot sent no code.",
            squash(&credentials.device)
        )));
    };
    let code = vault::code(&credentials.otpauth).map_err(|_| no_code())?;
    let mut answer = vec![("otp", code.as_str())];
    match recipient {
        Recipient::Listed(chosen) => {
            eprintln!(
                "ILIAS sign-in: the code is for the authenticator listed by Uni Pilot's name."
            );
            answer.push(("selectedCredentialId", chosen.id.as_str()));
        }
        Recipient::TheOnlyOne => {
            eprintln!("ILIAS sign-in: no list of authenticators; the code is for the only one.");
        }
    }
    match flow.visit(action, Some(&answer)).await? {
        Page::BackToIlias => Ok(flow.jar),
        Page::Otp { .. } => Err(SignInError::WrongCode),
        other => Err(stopped("after the code", &other)),
    }
}

fn no_code() -> SignInError {
    SignInError::Local("Uni Pilot's authenticator could not make a code.".into())
}

fn stopped(when: &str, page: &Page) -> SignInError {
    SignInError::Unrecognised(format!(
        "The sign-on showed a {} {when}. Uni Pilot stopped there; sign in yourself.",
        page.kind()
    ))
}

struct Flow<'h> {
    client: reqwest::Client,
    hosts: &'h Hosts,
    jar: Jar,
}

impl Flow<'_> {
    /// Sends one request — a POST when there is a form — and follows the
    /// sign-on's redirects with GETs until a page answers. A redirect back to
    /// ILIAS is not followed; one anywhere else ends the sign-in.
    async fn visit(
        &mut self,
        mut url: Url,
        mut form: Option<&[(&str, &str)]>,
    ) -> Result<Page, SignInError> {
        for _ in 0..=REDIRECT_LIMIT {
            let request = match form {
                Some(fields) => self.client.post(url.clone()).form(fields),
                None => self.client.get(url.clone()),
            };
            let request = match self.jar.header(&url) {
                Some(cookie) => request.header(header::COOKIE, cookie.as_str()),
                None => request,
            };
            let response = request.send().await.map_err(|error| {
                SignInError::Unreachable(format!("The sign-on could not be reached: {error}"))
            })?;
            let status = response.status();
            let kept = self.jar.store(
                &url,
                response
                    .headers()
                    .get_all(header::SET_COOKIE)
                    .iter()
                    .filter_map(|value| value.to_str().ok()),
            );
            let method = if form.is_some() { "POST" } else { "GET" };
            let said = |what: &str| {
                eprintln!(
                    "ILIAS sign-in: {method} {}{} → {status}, {what}, cookies set: [{}]",
                    url.host_str().unwrap_or_default(),
                    url.path(),
                    kept.join(", ")
                );
            };

            if status.is_redirection() {
                let Some(location) = response
                    .headers()
                    .get(header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| url.join(value).ok())
                else {
                    said("a redirect to nowhere");
                    return Ok(Page::Unknown);
                };
                if self.hosts.at_ilias(&location) {
                    said("back to ILIAS");
                    return Ok(Page::BackToIlias);
                }
                if !self.hosts.at_sign_on(&location) {
                    said(&format!(
                        "on to {}, where the sign-in does not go",
                        location.host_str().unwrap_or_default()
                    ));
                    return Ok(Page::Unknown);
                }
                // 307 and 308 would have the form sent again.
                if form.is_some()
                    && matches!(
                        status,
                        StatusCode::TEMPORARY_REDIRECT | StatusCode::PERMANENT_REDIRECT
                    )
                {
                    said("a redirect asking for the form again");
                    return Ok(Page::Unknown);
                }
                said("on to the sign-on");
                url = location;
                form = None;
                continue;
            }
            if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                said("busy");
                return Err(SignInError::Unreachable(format!(
                    "The sign-on is busy ({status}). Try again later."
                )));
            }
            let html = response.text().await.map_err(|error| {
                SignInError::Unreachable(format!("The sign-on could not be read: {error}"))
            })?;
            let page = self.hosts.classify(&url, &html);
            said(page.kind());
            return Ok(page);
        }
        eprintln!("ILIAS sign-in: too many redirects at the sign-on.");
        Ok(Page::Unknown)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::Method::{GET, POST};
    use httpmock::{Mock, MockServer, Then};

    const LOGIN: &str = include_str!("../fixtures/keycloak-login.html");
    const LOGIN_ERROR: &str = include_str!("../fixtures/keycloak-login-error.html");
    const OTP: &str = include_str!("../fixtures/keycloak-otp.html");
    const SELECT_METHOD: &str = include_str!("../fixtures/keycloak-select-method.html");

    const HHN_SIGN_ON: &str = "https://login.hs-heilbronn.de";

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    fn hhn() -> Hosts {
        Hosts::new(
            url("https://ilias.hs-heilbronn.de/openidconnect.php"),
            url("https://login.hs-heilbronn.de/realms/hhn"),
        )
        .unwrap()
    }

    /// Where HHN served the password form.
    fn auth() -> Url {
        url("https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth?client_id=hhn_common_ilias")
    }

    /// Where the forms post, as `#kc-form-login` says — not the language links.
    fn form_action() -> Url {
        url("https://login.hs-heilbronn.de/realms/hhn/login-actions/authenticate?session_code=REDACTED&execution=REDACTED&client_id=hhn_common_ilias&tab_id=REDACTED&client_data=REDACTED")
    }

    /// The recorded code page as an account with more than one authenticator
    /// sees it. DERIVED, not recorded: Keycloak 26's `login-otp.ftl` lists one
    /// radio per authenticator at the top of the form, labelled with the name
    /// it got at set-up, and checks one of its own choosing.
    fn otp_with(offered: &[(&str, &str, bool)]) -> String {
        let radios: String = offered
            .iter()
            .enumerate()
            .map(|(index, (id, label, checked))| {
                let checked = if *checked { r#" checked="checked""# } else { "" };
                format!(
                    r#"<input id="kc-otp-credential-{index}" class="pf-c-tile__input" type="radio" name="selectedCredentialId" value="{id}"{checked}>
                    <label for="kc-otp-credential-{index}" class="pf-c-tile" tabindex="{index}">
                        <span class="pf-c-tile__header">
                            <span class="pf-c-tile__icon"><i class="fa fa-mobile-alt" aria-hidden="true"></i></span>
                            <span class="pf-c-tile__title">{label}</span>
                        </span>
                    </label>"#
                )
            })
            .collect();
        let list = format!(
            r#"method="post"><div class="form-group"><div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">{radios}</div></div>"#
        );
        // The code form is the first on the page to post.
        OTP.replacen(r#"method="post">"#, &list, 1)
    }

    /// The student's phone, checked by Keycloak, and Uni Pilot's own.
    fn phone_and_uni_pilot() -> String {
        otp_with(&[
            ("phone-id", "iPhone", true),
            ("uni-pilot-id", "Uni Pilot", false),
        ])
    }

    #[test]
    fn classifies_every_recorded_page() {
        let hosts = hhn();
        assert_eq!(
            hosts.classify(&auth(), LOGIN),
            Page::Login {
                action: form_action()
            }
        );
        assert_eq!(hosts.classify(&form_action(), LOGIN_ERROR), Page::Error);
        assert_eq!(
            hosts.classify(&form_action(), OTP),
            Page::Otp {
                action: form_action(),
                authenticators: vec![]
            }
        );
        assert_eq!(hosts.classify(&form_action(), SELECT_METHOD), Page::Unknown);
        assert_eq!(
            hosts.classify(
                &url("https://ilias.hs-heilbronn.de/openidconnect.php?state=s&code=c"),
                ""
            ),
            Page::BackToIlias
        );
    }

    #[test]
    fn lists_the_authenticators_the_code_form_offers() {
        let Page::Otp { authenticators, .. } =
            hhn().classify(&form_action(), &phone_and_uni_pilot())
        else {
            panic!("not the code form");
        };
        assert_eq!(
            authenticators,
            [
                Authenticator {
                    id: "phone-id".into(),
                    label: "iPhone".into(),
                    checked: true
                },
                Authenticator {
                    id: "uni-pilot-id".into(),
                    label: "Uni Pilot".into(),
                    checked: false
                },
            ]
        );
    }

    /// Keycloak's words, in either language, without its forms, are nothing.
    #[test]
    fn reads_form_ids_not_words() {
        let words = r#"<h1 id="kc-page-title">Mit HHN-Account anmelden</h1>
            <label for="otp">One-time code</label> <input type="submit" value="Sign In"/>
            <p>kc-form-login kc-otp-login-form</p>"#;
        assert_eq!(hhn().classify(&auth(), words), Page::Unknown);
        let renamed = LOGIN
            .replace("Anmelden", "Weiter")
            .replace("Passwort", "Kennwort");
        assert!(matches!(
            hhn().classify(&auth(), &renamed),
            Page::Login { .. }
        ));
    }

    #[test]
    fn refuses_a_form_posting_to_another_host() {
        let hosts = hhn();
        for (from, to) in [
            (HHN_SIGN_ON, "https://evil.example"),
            (HHN_SIGN_ON, "http://login.hs-heilbronn.de"),
            (
                "/realms/hhn/login-actions/",
                "/realms/master/login-actions/",
            ),
            ("/realms/hhn/login-actions/", "/realms/hhn/account/"),
            (
                "/realms/hhn/login-actions/",
                "/realms/hhn/login-actions/../../../admin/",
            ),
        ] {
            let page = LOGIN.replace(from, to);
            assert_eq!(hosts.classify(&auth(), &page), Page::Unknown, "{to}");
        }
    }

    #[test]
    fn refuses_a_page_from_another_host() {
        let elsewhere = url("https://evil.example/realms/hhn/protocol/openid-connect/auth");
        assert_eq!(hhn().classify(&elsewhere, LOGIN), Page::Unknown);
        let other_realm =
            url("https://login.hs-heilbronn.de/realms/master/protocol/openid-connect/auth");
        assert_eq!(hhn().classify(&other_realm, LOGIN), Page::Unknown);
    }

    #[test]
    fn signs_in_over_https_to_a_known_realm_only() {
        let ilias = url("https://ilias.hs-heilbronn.de/openidconnect.php");
        for realm in [
            "http://login.hs-heilbronn.de/realms/hhn",
            "https://login.hs-heilbronn.de/",
            "https://login.hs-heilbronn.de/realms/hhn/account",
            "https://ilias.hs-heilbronn.de/realms/hhn",
        ] {
            assert!(Hosts::new(ilias.clone(), url(realm)).is_err(), "{realm}");
        }
        assert!(Hosts::new(ilias, url("https://login.hs-heilbronn.de/realms/hhn/")).is_ok());
    }

    /// The id `recipient` chose on a code page, `Some(None)` for "the only
    /// one", `None` for "no code".
    fn chosen(page: &str, device: &str) -> Option<Option<String>> {
        let Page::Otp { authenticators, .. } = hhn().classify(&form_action(), page) else {
            panic!("not the code form");
        };
        recipient(&authenticators, device).map(|chosen| match chosen {
            Recipient::TheOnlyOne => None,
            Recipient::Listed(listed) => Some(listed.id.clone()),
        })
    }

    /// No radio, one, two with Uni Pilot's name, two without — on the
    /// recorded code page and the ones derived from it.
    #[test]
    fn follows_the_radio_rule() {
        assert_eq!(
            chosen(OTP, "Uni Pilot"),
            Some(None),
            "no radio: the only one"
        );
        assert_eq!(
            chosen(
                &otp_with(&[("uni-pilot-id", "Uni Pilot", true)]),
                "Uni Pilot"
            ),
            Some(Some("uni-pilot-id".into())),
            "one radio, Uni Pilot's"
        );
        assert_eq!(
            chosen(&otp_with(&[("phone-id", "iPhone", true)]), "Uni Pilot"),
            None,
            "one radio, someone else's"
        );
        assert_eq!(
            chosen(&phone_and_uni_pilot(), " Uni  Pilot "),
            Some(Some("uni-pilot-id".into())),
            "two radios: Uni Pilot's, not the checked one"
        );
        assert_eq!(
            chosen(
                &otp_with(&[("phone-id", "iPhone", true), ("tablet-id", "iPad", false)]),
                "Uni Pilot"
            ),
            None,
            "two radios, neither Uni Pilot's"
        );
    }

    #[test]
    fn sends_no_code_when_two_radios_share_the_name() {
        let twice = [
            Authenticator {
                id: "a".into(),
                label: "Uni Pilot".into(),
                checked: false,
            },
            Authenticator {
                id: "b".into(),
                label: "Uni Pilot".into(),
                checked: true,
            },
        ];
        assert_eq!(recipient(&twice, "Uni Pilot"), None, "which one?");
    }

    // The whole sign-in, against ILIAS and the sign-on on two local servers.

    const PASSWORD: &str = "correct horse battery staple";
    /// RFC 4226's key, with a period longer than these tests will run: the
    /// code stays counter 0's, 755224, until 2096.
    const OTPAUTH: &str =
        "otpauth://totp/HHN:student?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=4000000000";
    const ACTIONS: &str = "/realms/hhn/login-actions/authenticate";

    fn student() -> Credentials {
        Credentials {
            username: "student@stud.hs-heilbronn.de".into(),
            password: PASSWORD.into(),
            otpauth: OTPAUTH.into(),
            device: "Uni Pilot".into(),
            stale: false,
        }
    }

    struct Local {
        ilias: MockServer,
        sign_on: MockServer,
    }

    impl Local {
        fn start() -> Self {
            Self {
                ilias: MockServer::start(),
                sign_on: MockServer::start(),
            }
        }

        fn hosts(&self) -> Hosts {
            Hosts::new(
                url(&self.ilias.url("/openidconnect.php")),
                url(&self.sign_on.url("/realms/hhn")),
            )
            .unwrap()
        }

        /// A recorded page with its forms and links on the local sign-on —
        /// never on HHN's.
        fn page(&self, html: &str) -> String {
            html.replace(HHN_SIGN_ON, &self.sign_on.base_url())
        }

        fn sign_in(&self) -> Result<Jar, SignInError> {
            tauri::async_runtime::block_on(sign_in(&self.hosts(), &student()))
        }
    }

    /// Every mock of one sign-in; `stray` answers whatever none of the others
    /// expected, so a test can say nothing else was sent.
    struct Hhn<'a> {
        entry: Mock<'a>,
        form: Mock<'a>,
        password: Mock<'a>,
        code: Mock<'a>,
        stray: [Mock<'a>; 2],
    }

    impl Hhn<'_> {
        fn assert_nothing_else(&self) {
            assert_eq!(
                self.stray[0].calls() + self.stray[1].calls(),
                0,
                "unexpected requests"
            );
        }
    }

    /// ILIAS and the sign-on as HHN answered on 03.10.2026, with Keycloak's
    /// cookies (values made up); what follows the password and the code is
    /// the test's to say. The code POST matches only with
    /// `selectedCredentialId=<code_for>`, or without the field for `None`.
    fn hhn_at<'a>(
        local: &'a Local,
        after_password: impl FnOnce(Then) -> Then,
        code_for: Option<&str>,
        after_code: impl FnOnce(Then) -> Then,
    ) -> Hhn<'a> {
        let entry = local.ilias.mock(|when, then| {
            when.method(GET).path("/openidconnect.php");
            then.status(302).header(
                "location",
                local.sign_on.url(
                    "/realms/hhn/protocol/openid-connect/auth?client_id=hhn_common_ilias&response_type=code&scope=openid+openid&state=s&nonce=n",
                ),
            );
        });
        let form = local.sign_on.mock(|when, then| {
            when.method(GET)
                .path("/realms/hhn/protocol/openid-connect/auth")
                .query_param("client_id", "hhn_common_ilias");
            then.status(200)
                .header("set-cookie", "AUTH_SESSION_ID=session.node1; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly")
                .header("set-cookie", "KC_RESTART=restart; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly")
                .header("set-cookie", "KC_AUTH_SESSION_HASH=hash; Max-Age=60; Path=/realms/hhn/; SameSite=None; Secure")
                .header("set-cookie", "hhn-login-bs=node1; path=/")
                .header("set-cookie", "ELSEWHERE=x; Path=/realms/other/")
                .body(local.page(LOGIN));
        });
        // The cookies that have to come back with each POST, and one that must not.
        let password = local.sign_on.mock(|when, then| {
            when.method(POST)
                .path(ACTIONS)
                .query_param("session_code", "REDACTED")
                .form_urlencoded_tuple("username", "student@stud.hs-heilbronn.de")
                .form_urlencoded_tuple("password", PASSWORD)
                .form_urlencoded_tuple("credentialId", "")
                .form_urlencoded_tuple_missing("otp")
                .cookie("AUTH_SESSION_ID", "session.node1")
                .cookie("KC_RESTART", "restart")
                .cookie("KC_AUTH_SESSION_HASH", "hash")
                .cookie("hhn-login-bs", "node1")
                .cookie_missing("ELSEWHERE");
            after_password(then);
        });
        let code = local.sign_on.mock(|when, then| {
            let when = when
                .method(POST)
                .path(ACTIONS)
                .query_param("session_code", "REDACTED")
                .form_urlencoded_tuple("otp", "755224")
                .form_urlencoded_tuple_missing("password")
                .cookie("AUTH_SESSION_ID", "session.node1")
                .cookie("hhn-login-bs", "node1");
            match code_for {
                Some(id) => when.form_urlencoded_tuple("selectedCredentialId", id),
                None => when.form_urlencoded_tuple_missing("selectedCredentialId"),
            };
            after_code(then);
        });
        let stray = [
            local.sign_on.mock(|_, then| {
                then.status(418);
            }),
            local.ilias.mock(|_, then| {
                then.status(418);
            }),
        ];
        Hhn {
            entry,
            form,
            password,
            code,
            stray,
        }
    }

    fn signed_in(local: &Local) -> impl FnOnce(Then) -> Then + '_ {
        move |then| {
            then.status(302)
                .header("location", local.ilias.url("/openidconnect.php?state=s&session_state=x&code=c"))
                .header("set-cookie", "KEYCLOAK_IDENTITY=identity; Version=1; Path=/realms/hhn/; SameSite=None; Secure; HttpOnly")
                .header("set-cookie", "KEYCLOAK_SESSION=hhn/student/x; Version=1; Max-Age=36000; Path=/realms/hhn/; SameSite=None; Secure")
        }
    }

    fn shows(page: String, status: u16) -> impl FnOnce(Then) -> Then {
        move |then| then.status(status).body(page)
    }

    #[test]
    fn signs_in_with_one_post_each() {
        let local = Local::start();
        let hhn = hhn_at(
            &local,
            shows(local.page(&phone_and_uni_pilot()), 200),
            Some("uni-pilot-id"),
            signed_in(&local),
        );

        let jar = local.sign_in().unwrap_or_else(|error| panic!("{error:?}"));

        assert_eq!(hhn.form.calls(), 1);
        assert_eq!(hhn.password.calls(), 1, "one password POST");
        assert_eq!(hhn.code.calls(), 1, "one code POST");
        assert_eq!(
            hhn.entry.calls(),
            1,
            "the redirect back to ILIAS is not followed"
        );
        hhn.assert_nothing_else();

        let realm = url(&local.sign_on.url("/realms/hhn/x"));
        let cookies = jar.header(&realm).unwrap();
        assert!(
            cookies.contains("KEYCLOAK_IDENTITY=identity"),
            "{}",
            *cookies
        );
        assert!(
            cookies.contains("KEYCLOAK_SESSION=hhn/student/x"),
            "{}",
            *cookies
        );
    }

    #[test]
    fn a_refused_password_is_not_tried_again() {
        let local = Local::start();
        let hhn = hhn_at(
            &local,
            shows(local.page(LOGIN_ERROR), 401),
            Some("uni-pilot-id"),
            signed_in(&local),
        );

        assert_eq!(local.sign_in().err(), Some(SignInError::WrongPassword));
        assert_eq!(hhn.password.calls(), 1);
        assert_eq!(hhn.code.calls(), 0);
        hhn.assert_nothing_else();
    }

    #[test]
    fn a_refused_code_is_not_tried_again() {
        let local = Local::start();
        let hhn = hhn_at(
            &local,
            shows(local.page(&phone_and_uni_pilot()), 200),
            Some("uni-pilot-id"),
            shows(local.page(&phone_and_uni_pilot()), 401),
        );

        assert_eq!(local.sign_in().err(), Some(SignInError::WrongCode));
        assert_eq!(hhn.password.calls(), 1);
        assert_eq!(hhn.code.calls(), 1);
        hhn.assert_nothing_else();
    }

    /// The radio rule through the whole sign-in. No radio: one code POST
    /// without `selectedCredentialId`, for the account's only authenticator.
    /// Radios: one code POST for Uni Pilot's, never the checked one. Radios
    /// without Uni Pilot's: no code POST at all.
    #[test]
    fn sends_the_code_by_the_radio_rule() {
        /// `Some(field)`: one code POST with that `selectedCredentialId`.
        type Sent = Option<Option<&'static str>>;
        let cases: [(&str, String, Sent); 4] = [
            ("no radio", OTP.to_string(), Some(None)),
            (
                "one radio, Uni Pilot's",
                otp_with(&[("uni-pilot-id", "Uni Pilot", true)]),
                Some(Some("uni-pilot-id")),
            ),
            (
                "two radios, one Uni Pilot's",
                phone_and_uni_pilot(),
                Some(Some("uni-pilot-id")),
            ),
            (
                "two radios, neither Uni Pilot's",
                otp_with(&[("phone-id", "iPhone", true), ("tablet-id", "iPad", false)]),
                None,
            ),
        ];
        for (case, code_page, sent) in cases {
            let local = Local::start();
            let hhn = hhn_at(
                &local,
                shows(local.page(&code_page), 200),
                sent.flatten(),
                signed_in(&local),
            );

            let result = local.sign_in();
            assert_eq!(hhn.password.calls(), 1, "{case}");
            match sent {
                Some(_) => {
                    assert!(result.is_ok(), "{case}: {:?}", result.err());
                    assert_eq!(hhn.code.calls(), 1, "{case}");
                }
                None => {
                    assert!(
                        matches!(result, Err(SignInError::Unrecognised(_))),
                        "{case}"
                    );
                    assert_eq!(hhn.code.calls(), 0, "{case}");
                }
            }
            hhn.assert_nothing_else();
        }
    }

    #[test]
    fn stops_at_try_another_way() {
        let local = Local::start();
        let hhn = hhn_at(
            &local,
            shows(local.page(SELECT_METHOD), 200),
            Some("uni-pilot-id"),
            signed_in(&local),
        );

        assert!(matches!(local.sign_in(), Err(SignInError::Unrecognised(_))));
        assert_eq!(hhn.password.calls(), 1);
        assert_eq!(hhn.code.calls(), 0);
        hhn.assert_nothing_else();
    }

    /// A 307 after the code would have it sent again.
    #[test]
    fn never_sends_a_form_twice_through_a_redirect() {
        let local = Local::start();
        let again = local
            .sign_on
            .url(&format!("{ACTIONS}?session_code=REDACTED"));
        let hhn = hhn_at(
            &local,
            shows(local.page(&phone_and_uni_pilot()), 200),
            Some("uni-pilot-id"),
            move |then| then.status(307).header("location", again),
        );

        assert!(matches!(local.sign_in(), Err(SignInError::Unrecognised(_))));
        assert_eq!(hhn.code.calls(), 1);
        hhn.assert_nothing_else();
    }

    #[test]
    fn sends_no_password_to_a_form_on_another_host() {
        let local = Local::start();
        let foreign = MockServer::start();
        let anything = foreign.mock(|_, then| {
            then.status(200);
        });
        let elsewhere = LOGIN.replace(HHN_SIGN_ON, &foreign.base_url());
        local.sign_on.mock(|when, then| {
            when.method(GET)
                .path("/realms/hhn/protocol/openid-connect/auth");
            then.status(200).body(elsewhere);
        });
        local.ilias.mock(|when, then| {
            when.method(GET).path("/openidconnect.php");
            then.status(302).header(
                "location",
                local
                    .sign_on
                    .url("/realms/hhn/protocol/openid-connect/auth"),
            );
        });

        assert!(matches!(local.sign_in(), Err(SignInError::Unrecognised(_))));
        assert_eq!(anything.calls(), 0);
    }

    #[test]
    fn follows_ilias_to_its_known_sign_on_only() {
        let local = Local::start();
        let foreign = MockServer::start();
        let anything = foreign.mock(|_, then| {
            then.status(200).body(LOGIN);
        });
        local.ilias.mock(|when, then| {
            when.method(GET).path("/openidconnect.php");
            then.status(302).header(
                "location",
                foreign.url("/realms/hhn/protocol/openid-connect/auth"),
            );
        });

        assert!(matches!(local.sign_in(), Err(SignInError::Unrecognised(_))));
        assert_eq!(anything.calls(), 0);
    }

    #[test]
    fn sends_nothing_with_a_broken_authenticator() {
        let local = Local::start();
        let anything = local.ilias.mock(|_, then| {
            then.status(500);
        });
        let mut broken = student();
        broken.otpauth = "otpauth://totp/HHN:student?digits=6".into();

        let result = tauri::async_runtime::block_on(sign_in(&local.hosts(), &broken));
        assert!(matches!(result, Err(SignInError::Local(_))));
        assert_eq!(anything.calls(), 0);
    }

    #[test]
    fn the_test_code_is_counter_zeros() {
        assert_eq!(vault::code(OTPAUTH).unwrap().as_str(), "755224");
    }
}
