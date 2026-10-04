# Face unlock — implementation plan

**Branch:** `feature/face-unlock`, from `feature/all-in-one-sidebar` (`dfb5498`), worktree
`/Users/mili/Coding/Uni-Pilot-face`. Local only, not pushed yet.
**Written:** 03.10.2026. **Baseline:** `npm run check` and `cargo test` green on the branch (§9).

## 1. Goal

When ILIAS needs a sign-in, the student looks into the camera and Uni Pilot signs in to HHN
for them — no password, no authenticator code.

**Not goals:**

- Stopping a determined attacker who holds up a good photo or video of the student. A plain
  laptop camera has no depth or infrared sensor; we make spoofing hard, not impossible (§7).
- Replacing the Mac's own lock. Face unlock only works on a Mac that is already unlocked.
- Passkeys inside Uni Pilot. Blocked on macOS without HHN's cooperation (see the research in
  the chat of 02.10.2026; summary in §10).
- Syncing anything. Credentials and the face template never leave this computer.

## 2. Before anyone merges this

1. **The team agrees to change a rule.** `docs/ilias-window.md` says: _"Uni Pilot never injects
   script into ILIAS … nothing that … fills in the login form"_ and _"Not stored anywhere by
   Uni Pilot: no password, no token, no session id."_ This feature stores the password and the
   authenticator secret. Refik owns the earlier ILIAS work and has to sign off. The webview
   still gets no script: Rust signs in over HTTP (§4.3), so the first sentence of the rule can stay.
2. **HHN's rules.** Check whether HHN allows keeping the authenticator secret in an app. If not,
   the feature can still ship for the password alone (student types the code) — see §11 Q4.
3. **Opt-in, off by default.** Nothing happens until the student sets it up in Settings.

## 3. What exists today (on this branch)

| Piece                     | Where                                                                 | What it does                                                                                                             |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Session renewal           | `src-tauri/src/ilias_sync/reauth.rs` (`ilias_sync_reauth`)            | Hidden window at ILIAS's `openidconnect.php`; passes when Keycloak still remembers the student, `NeedsSignIn` otherwise. |
| Renewal trigger           | `src/features/courses/store/courseStore.ts` (`withRenewal`)           | On `session-expired`, calls `renewIliasSession` once, then gives up.                                                     |
| "Sign in" notice          | `src/features/courses/components/CourseNotices.tsx` (`FailureNotice`) | _"Sign in to ILIAS to update"_ → navigates to ILIAS mode. **This is where the face button goes.**                        |
| HTTP with webview cookies | `src-tauri/src/ilias_sync/fetch.rs`                                   | reqwest via `tauri-plugin-http`, manual redirects, pacing, User-Agent. Logs cookie **names** only.                       |
| Cookie store              | `fetch.rs` header comment                                             | The ILIAS view shares the default store with Uni Pilot's own page.                                                       |
| Cookie API                | Tauri 2.11.5                                                          | `Webview::cookies_for_url`, `cookies`, **`set_cookie`**, `delete_cookie`.                                                |
| Sign-out                  | `src-tauri/src/ilias_sign_out.rs`                                     | `cookie_reaches(domain, host)` — reuse for the cookie jar.                                                               |
| Errors to the page        | `ilias_sync::SyncError`                                               | `#[serde(tag = "kind", content = "message", rename_all = "camelCase")]` — copy that shape.                               |
| Settings page             | `src/pages/SettingsPage.tsx`                                          | Appearance, sidebar, reminders. New section goes here — **no new route**, so `navigation.ts` stays untouched.            |
| Capabilities              | `src-tauri/capabilities/default.json`                                 | Only the `main` window can call commands. ILIAS's view cannot. Keep it so.                                               |
| macOS bundle              | `src-tauri/Info.plist`, `tauri.conf.json`                             | Only `NSAppleEventsUsageDescription`. `signingIdentity: "-"` (ad hoc), `hardenedRuntime: false`.                         |
| CI                        | `.github/workflows/ci.yml`                                            | `npm run build`, `cargo check`, `cargo test` on ubuntu-22.04. Release builds macOS universal, Linux x64, Windows x64.    |

HHN facts checked live on 02.10.2026:

- Sign-in is Keycloak at `https://login.hs-heilbronn.de/realms/hhn`; ILIAS's client is
  `hhn_common_ilias` (seen in `reauth.rs` tests).
- The password page (`#kc-form-login`) has `username`, `password`, hidden `credentialId`, submit
  `login`. **No "remember me"** (`#kc-form-options` is empty).
- `/.well-known/apple-app-site-association` is an HTML page, not an AASA file.

## 4. Architecture

```
 Sync says session-expired ─► withRenewal ─► ilias_sync_reauth ─► NeedsSignIn
                                                                      │
                     FailureNotice: [Unlock with your face]  ◄────────┘  (only if set up)
                                   │ click — camera turns on only now
                                   ▼
  React: CameraView ── JPEG frames (raw IPC) ──►  Rust: face_unlock::Attempt
                                                   ├ detect (YuNet) ─ align ─ embed (SFace)
                                                   ├ anti-spoof (MiniFASNet)
                                                   └ random challenge (turn left/right, come closer)
                                                         │ match on every frame + challenge done
                                                         ▼
                                                  vault: read password + otpauth (Keychain)
                                                         ▼
                                                  keycloak::sign_in over HTTP (own cookie jar)
                                                         ▼
                                                  handoff: login.hs-heilbronn.de cookies
                                                           → webview store (set_cookie)
                                                         ▼
                                                  reauth::renew (existing hidden window)
                                                         ▼
                                       Signed in ─► page retries the sync
```

### 4.1 Trust boundaries

- **Secrets and the decision live in Rust.** The page sends camera frames and shows prompts. It
  never receives the password, the code, the authenticator secret, the face template, or
  "you may sign in now". When the face matches, Rust signs in by itself and returns only the
  outcome.
- Frames from the page are untrusted input — no worse than someone holding a photo to the camera.
- The ILIAS view only ever gets cookies, exactly as after a manual sign-in.

### 4.2 Why Rust signs in to Keycloak only, not ILIAS

Rust starts at ILIAS's `openidconnect.php` (ILIAS builds the correct Keycloak URL with its
`state`), submits Keycloak's forms, and **stops at the redirect back to ILIAS** without following
it. By then Keycloak has set its session cookies (`KEYCLOAK_IDENTITY`, `KEYCLOAK_SESSION`, …).
Rust copies those into the webview store; `reauth.rs`'s hidden window then passes straight through
Keycloak and creates the ILIAS session the normal way. The unused authorization code expires on
its own. Fewer cookies forged, ILIAS untouched, existing code reused.

### 4.3 Why HTTP and not filling the form in a webview

Filling the form would need script in a webview, which the ILIAS rule forbids, and it is
hard to test. An HTTP flow parses HTML with `scraper` (already a dependency) and runs in tests
against recorded pages.

## 5. File layout

Follows `CLAUDE.md`: tests next to sources, feature code under `src/features/<name>/`,
`@/` imports, no hard-coded colours, accessible names.

```
src-tauri/
  models/                         ONNX files + README.md with source URL, version, SHA-256
    face_detection_yunet_2023mar.onnx          (MIT, ~230 KB)
    face_recognition_sface_2021dec_int8.onnx   (Apache-2.0, ~10 MB; fp32 ~37 MB as fallback)
    minifasnet_v2.onnx                         (Apache-2.0, ~1.7 MB)
  src/
    vault.rs                      Keychain / Credential Manager / Secret Service via `keyring`
    ilias_sync/
      reauth.rs                   refactor: pub async fn renew(app, base_url, client_id) -> bool
      sign_in/
        mod.rs                    SignInError, sign_in(), command for the manual button
        keycloak.rs               page classification, form extraction, the HTTP flow
        jar.rs                    minimal cookie jar on the `cookie` crate
        handoff.rs                jar → webview set_cookie, then renew()
      fixtures/
        keycloak-login.html       recorded (§6 Phase 0.2)
        keycloak-otp.html         recorded
        keycloak-login-error.html recorded or derived (says which in its header)
    face_unlock/
      mod.rs                      commands, managed state (Mutex<Option<Attempt>>)
      models.rs                   loads the three models once, from resources
      detect.rs                   YuNet decode + NMS → box + 5 landmarks
      align.rs                    similarity transform to the 112×112 ArcFace template
      embed.rs                    SFace → 128-d, L2-normalised; cosine
      liveness.rs                 MiniFASNet score; yaw / distance from landmarks
      attempt.rs                  enrolment and unlock state machines (pure, no I/O)
      fixtures/                   synthetic tensors only — no face photos in git (§8)
src/features/face-unlock/
  index.ts
  FaceUnlock.test.tsx             integration via renderApp
  components/
    AutoSignInSettings.tsx (+ .test.tsx)   Settings section
    CredentialsDialog.tsx  (+ .test.tsx)   username, password, otpauth link
    FaceEnrollDialog.tsx   (+ .test.tsx)
    FaceUnlockDialog.tsx   (+ .test.tsx)
    CameraView.tsx         (+ .test.tsx)   <video>, oval guide, aria-live prompt
  store/
    faceUnlockStore.ts     (+ .test.ts)    status, attempts left, cooldown — no secrets
  lib/
    faceUnlock.ts          (+ .test.ts)    invoke wrappers, error mapping
    camera.ts              (+ .test.ts)    getUserMedia, frame grabbing, stop()
    prompts.ts                              challenge → copy
docs/face-unlock.md                         how it works, what is stored, threat model
```

Changed files: `src-tauri/src/lib.rs` (modules, commands, `.manage`), `Cargo.toml`,
`tauri.conf.json` (resources), `Info.plist`, `src/pages/SettingsPage.tsx`,
`src/features/courses/components/CourseNotices.tsx`, `docs/ilias-window.md`,
`THIRD-PARTY-LICENSES.md`, `licenses/`.

New crates (none are in `Cargo.lock` yet): `keyring` 3 (`apple-native`, `windows-native`,
`sync-secret-service`), `totp-rs` (`otpauth`, `zeroize`), `tract-onnx` (or `ort`, §6 Phase 0.5),
`image` (`jpeg` only). `zeroize` is already in the tree. Dev: `httpmock` or `wiremock` for the
HTTP flow test.

## 6. Phases

Each phase ends with `npm run check` and `cargo test --manifest-path src-tauri/Cargo.toml`
green, its docs updated, and one commit. Phases 1–3 are useful without any face code; if Phase 2
turns out impossible, stop there and save the face work.

### Phase 0 — Spikes (answer the unknowns first)

Throwaway code on a `spike/…` branch or behind `#[cfg(debug_assertions)]`; nothing merged.

| #   | Question                                                                                                                                                                         | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Done when                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0.1 | Baseline green?                                                                                                                                                                  | `npm ci && npm run check`, `cargo test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Both pass (§9)                                                                |
| 0.2 | What do HHN's pages look like?                                                                                                                                                   | **Password page** — fetchable without an account: `curl -L "https://login.hs-heilbronn.de/realms/hhn/protocol/openid-connect/auth?client_id=account-console&redirect_uri=https%3A%2F%2Flogin.hs-heilbronn.de%2Frealms%2Fhhn%2Faccount%2F&response_type=code&scope=openid&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"`. **Code page** — needs a real account: the student signs in in Safari and, at the code step, saves the page source (no password in it). Replace `session_code`, `execution`, `tab_id` values with `REDACTED`. Note any page between password and code ("choose a method", passkey offer). | Fixtures in `ilias_sync/fixtures/`, each with a header: date, how, redactions |
| 0.3 | Does a cookie set with `set_cookie` count for Keycloak in the webview?                                                                                                           | Dev command: after a manual sign-in, read `login.hs-heilbronn.de` cookies, delete them and ILIAS's, set the Keycloak ones back, call `ilias_sync_reauth`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Returns `true` on macOS; then Windows                                         |
| 0.4 | Does `getUserMedia` work in the Tauri window?                                                                                                                                    | Add `NSCameraUsageDescription`, show a `<video>` in a dev page. Check macOS, Windows (WebView2 permission), Linux (WebKitGTK media stream).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Preview visible; permission asked once                                        |
| 0.5 | Can `tract-onnx` run the three models fast enough?                                                                                                                               | Load YuNet (known to work with tract), SFace int8 + fp32, MiniFASNet V2 with fixed input shapes. Time a release build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | All load; < 150 ms per frame for all three on an M1. Else switch to `ort`     |
| 0.6 | How does the Keychain behave with ad-hoc signing?                                                                                                                                | `keyring` write → rebuild → read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Behaviour written down (prompt once per update expected)                      |
| 0.7 | ~~Can Uni Pilot be its own passkey?~~ **Dropped 04.10.2026:** Uni Pilot already gets its own authenticator (not a copy of the phone's), which is just as separate and revocable. | Was proposed 03.10.2026. Account page → Signing in → Passkey → Set up, in the browser pane; read the registration page's WebAuthn options (attestation, algorithms, user verification, attachment); cancel. Then, only if they allow a software authenticator: register one from Rust and check the code step still defaults to the authenticator app.                                                                                                                                                                                                                                                                                                     | Options recorded; go/no-go for replacing `otpauth` in Phase 1–2               |

### Phase 1 — Vault and authenticator codes (Rust, no UI)

- `vault.rs`, service `com.unipilot.desktop` (the app identifier), two entries:
  - `ilias-sign-in:<installation host>` → JSON `{ username, password, otpauth, device }` —
    `device` is the name Uni Pilot's authenticator got at set-up (default "Uni Pilot"), needed to
    pick it on the code page (Phase 2).
  - `face-template` → base64 of one averaged, L2-normalised 128 × f32 template (512 bytes).

  Two entries because Windows Credential Manager caps a secret at 2560 bytes.

- `otpauth` stored as the full `otpauth://totp/…` URL so algorithm, digits and period come
  along. Parse with `TOTP::from_url`; refuse `hotp`, refuse a missing secret.
- Commands (all `async`, errors shaped like `SyncError`):
  - `auto_sign_in_status() -> { credentials: bool, username: Option<String>, face: bool }` —
    never the password.
  - `auto_sign_in_save(username, password, otpauth)` — validates, then stores.
  - `auto_sign_in_forget()` — deletes both entries.
- Secrets in `Zeroizing<String>`; never logged, never in `Debug` output.
- **Tests:** RFC 6238 vectors through `totp-rs`; otpauth parsing (valid, hotp, no secret,
  garbage); vault round trip on `keyring`'s mock credential builder; `status` never contains the
  password (serialise and assert).

**Built (04.10.2026), `src-tauri/src/vault.rs`** — where it differs from the above:

- `totp-rs` **6** (`Totp`, `Builder`, `Token`); `Totp::from_url` already refuses `hotp` and a link
  without a secret. `Secret` debug-prints as `REDACTED`; `Totp` and `Token` wipe on drop.
- No `keyring` mock: its mock entries do not persist from one `Entry::new` to the next. The vault
  talks to a small `Store` trait instead — `Platform` (keyring) in the app, a map in tests.
- The commands take `baseUrl` (the entry is keyed by the ILIAS host); save takes `authenticator`
  (link or bare base32 secret) and an optional `device` name (default "Uni Pilot"), and returns
  the status. The stored JSON is `{ username, password, otpauth, device, stale }`.
- `VaultError`: `invalid` (never echoes the input), `refused` (the Keychain's -128 / -25293, read
  through `security-framework` 3 — what keyring uses on macOS — per spike 0.6), `unavailable`.
- Keychain calls run on a blocking thread: a prompt can wait as long as the student does.
- Not covered by tests: the `Platform` adapter against a real store, and `refused` (needs someone
  to click Deny). `code()` waits for Phase 2.

### Phase 2 — Signing in to Keycloak over HTTP (Rust)

`ilias_sync/sign_in/keycloak.rs`:

1. GET `{ilias}/openidconnect.php` with redirects off; follow by hand. Allowed hosts: the ILIAS
   origin and the Keycloak origin found in the first redirect — and that must match the
   installation's known sign-on (`login.hs-heilbronn.de` for HHN; put it next to the ILIAS
   address in `knownInstallations.ts` and pass it in). Anything else → `Unrecognised`.
2. `classify(url, html) -> Page`:
   `Login { action }` (`#kc-form-login`), `Otp { action, credential }` (`#kc-otp-login-form`,
   input `otp`, optional `selectedCredentialId` radios — one per authenticator, labelled with the
   name given at set-up. Uni Pilot has **its own** authenticator next to the student's phone, and
   Keycloak pre-checks the phone's: pick the radio labelled with Uni Pilot's stored name, never the
   checked one; none labelled so → `Unrecognised`),
   `Error(message)` (Keycloak's alert), `BackToIlias` (redirect to the ILIAS origin),
   `Unknown`.
3. `Login` → POST `username`, `password`, `credentialId=""` to `action` (must be on the
   Keycloak origin, path under `/realms/<realm>/login-actions/`).
4. Expect `Otp` → generate the code **at this moment** and POST `otp` (+ `selectedCredentialId`).
   `Login` again with an error → `WrongPassword`. Anything else → `Unrecognised`.
5. Expect a redirect to ILIAS → **success; do not follow it**. `Otp` again → `WrongCode`.
6. **At most one password POST and one code POST per unlock. No retries, ever.** Keycloak may
   lock the account after repeated failures.

`jar.rs`: parse `Set-Cookie` with the `cookie` crate (Tauri re-exports it as
`tauri::webview::cookie`), keep domain, path, secure, http-only, expiry; send by domain and path
match (reuse `cookie_reaches`). `handoff.rs`: every jar cookie for the Keycloak host →
`set_cookie` on the main webview (shared store), then `reauth::renew`.

`SignInError`: `NotSetUp`, `WrongPassword`, `WrongCode`, `Unrecognised(String)`,
`Unreachable(String)`, `Local(String)`. On `WrongPassword`, mark the stored credentials stale so
the face is not asked again until they are updated.

Same User-Agent as `fetch.rs`. Log page kinds and cookie names, never values.

- **Tests:** `classify` on every fixture; form action extraction and refusal of a foreign host;
  jar matching (domain, path, secure, expiry); the whole flow against a local mock server serving
  the fixtures (hosts injectable for tests); "one POST each" asserted on the mock.
- **Done when:** a temporary dev-only button signs in a real HHN account end to end on macOS.

**Built (04.10.2026), `src-tauri/src/ilias_sync/sign_in/`** — nothing was sent to
`login.hs-heilbronn.de` while building it; the run against a real account is Ermir's. Where it
differs from the above:

- **Dev button** (since replaced by Phase 3, see there): "Store sign-in…" and "Test sign-in" in the
  "Sign in to ILIAS" notice, under `import.meta.env.DEV`, with `sign_in_to_ilias` behind
  `#[cfg(debug_assertions)]`. Ermir signed in to HHN with it on 04.10.2026.
- The command calls `sign_in_stored`: it reads `{ username, password, otpauth, device }` from the
  vault for that ILIAS host (`vault::stored_sign_in`, on a blocking thread), then `sign_in_with` →
  `keycloak::sign_in` (HTTP only, returns the jar) → `handoff::hand_off`. Nothing is stored →
  `NotSetUp`. `WrongPassword` marks the entry `stale` (`vault::mark_stale`); a stale entry answers
  `WrongPassword` **without a request** until the student saves the password again, so a wrong
  password is never sent twice. Nothing of the vault is logged.
- **The sign-on is chosen in Rust, by ILIAS host** (`SIGN_ONS` in `sign_in/mod.rs`, HHN only): the
  page names the ILIAS, never the sign-on. A page that could name the sign-on could send the stored
  password to any HTTPS host. So the plan's "put it in `knownInstallations.ts` and pass it in" is
  dropped. HTTPS only (loopback allowed, for the tests).
- `classify(url, html)` is a method on `Hosts`, which knows both origins. `Error` is
  `#kc-form-login` holding an element whose id starts with `input-error` — an id, not words.
  `Unknown`: `#kc-select-credential-form`; two of the known forms on one page; a form that does not
  post to the realm's `login-actions/` (after `..` is resolved); a page outside the realm; Keycloak's
  own error page (`#kc-error-message`), so an expired sign-in after the password does not read as a
  wrong password.
- **Radio rule.** No radio on the code page (the account has one authenticator, as on the recorded
  page) → the code goes to that one, without `selectedCredentialId`, as from a browser. Radios →
  only the one labelled with the stored device name, `checked` is never used; none or two with that
  name → `Unrecognised`, no code POST. Labels are compared with whitespace squashed,
  case-sensitive. With one authenticator, a code from the wrong secret costs one failed attempt
  (`WrongCode`), never two.
- The status decides only redirects and trouble (429, 5xx → `Unreachable`). 2xx and 4xx bodies are
  classified: Keycloak may show a refused password or code with 400/401.
- Redirects: followed with GET within the realm, at most 5; to the ILIAS origin → `BackToIlias`, not
  followed; elsewhere → `Unknown`. A 307/308 after a POST → `Unknown`, since it would send the form
  again.
- `BackToIlias` right after the password (an account without a second factor) counts as signed in.
- The authenticator is checked before the first request, so a broken one costs no password POST;
  the code is made right before its POST.
- `jar.rs` uses `tauri::webview::cookie` (cookie 0.18). A `Domain` must reach the host that set it
  and contain a dot. Secure cookies are kept and sent only over HTTPS or to loopback, as browsers do,
  which lets `httpmock` stand in for the sign-on. `cookie_reaches` is `pub(crate)` now.
- `handoff.rs` rebuilds every live jar cookie that reaches the sign-on host with that host as domain
  (as in spike 0.3), keeping path, Secure, HttpOnly, SameSite and expiry, and sets it on the `main`
  webview. `reauth.rs` has `pub async fn renew(app, base_url, client_id)`; the command wraps it.
- Tests (dev dependency `httpmock` 0.8): the whole flow against two local servers, ILIAS and the
  sign-on, serving the four fixtures with HHN's host replaced by the local one. A catch-all mock on
  each asserts nothing else was asked. The code page with two authenticators is derived in the test
  from `keycloak-otp.html` and Keycloak 26's `login-otp.ftl`, not a new fixture. The test
  authenticator has `period=4000000000`, so its code stays 755224. The radio rule is tested for no
  radio, one, two with the name and two without, by itself and through the whole flow.
- Not covered: `hand_off` and the command (they need a real webview and Keychain) and anything
  against HHN — the **Done when** above is still open.

### Phase 3 — Settings and a manual "Sign in automatically" (UI, no face)

- `AutoSignInSettings` in `SettingsPage`: what it does, what is stored and where, buttons
  **Set up**, **Test sign-in**, **Forget**. Copy reviewed against the "calm UI" preference — no
  counters, no badges.
- `CredentialsDialog`: username, password (type password, `autocomplete="off"`), authenticator
  link. Explain where the link comes from: HHN's account page → add a **second** authenticator
  for Uni Pilot (the phone keeps its own) → "Unable to scan?" shows the secret; name the device
  "Uni Pilot" and confirm it with a code Uni Pilot shows. Accept a bare base32 secret too (build
  the URL with Keycloak's defaults: SHA1, 6 digits, 30 s). Never ask for recovery codes.
- `FailureNotice`: when set up, primary button **Sign in automatically**, secondary
  **Sign in yourself**. In Phase 5 the primary becomes **Unlock with your face**.
- Until a gate exists (Phase 5 or 7), the automatic button is shown only in development builds
  (`import.meta.env.DEV`).
- **Tests:** `renderApp('/settings')` set-up flow with `invoke` mocked (pattern:
  `src/features/courses/store/courseStore.test.ts`); the password is never echoed back into the
  DOM after saving; `FailureNotice` shows the right buttons for set-up / not set up.

**Built (04.10.2026), `src/features/auto-sign-in/`** — no face. Where it differs from the above:

- The feature is `auto-sign-in`, not `face-unlock`: `lib/autoSignIn.ts` (invoke wrappers, texts),
  `store/autoSignInStore.ts`, `components/AutoSignInSettings.tsx` and `CredentialsDialog.tsx`,
  `AutoSignIn.test.tsx` at the root. The face can build on it later.
- **No `DEV` gate.** "Sign in automatically" shows in release builds whenever a sign-in is stored
  and not stale: `sign_in_to_ilias` is a normal command now. It answers only Uni Pilot's own
  page — checked by **webview** label, because the ILIAS view is a webview of the `main` window
  (Tauri's ACL already turns away remote pages; this turns away any other local webview). The page
  still sends only `baseUrl` and `clientId`. The dev-only "Store sign-in…" / "Test sign-in" are
  gone.
- **The notice never reads the credential store.** Whether a sign-in is stored is remembered per
  ILIAS host in `autoSignInStore` (persisted; user name, device name, `stale` — never a secret).
  Settings asks Rust once while nothing is remembered; save, forget and every sign-in keep it up
  to date. Reason: on a Mac the read can bring up the Keychain's password prompt after an update
  (§12, 0.6), and that should follow a click, not a notice appearing.
- `stale` (HHN refused the password) → the notice offers only "Sign in to ILIAS", with a link to
  Settings; Settings says so and disables Test sign-in. Save and Forget clear it.
- **The code to confirm the authenticator at HHN** comes from a new command,
  `auto_sign_in_code(authenticator)`: made from what was just typed, nothing stored, the store not
  read — so a stored authenticator's codes never reach the page. The dialog shows it and quietly
  replaces it when it changes; no countdown.
- The dialog explains the set-up in three steps (second authenticator app on HHN's account page,
  "Unable to scan?", code and name) and asks for nothing else — no recovery codes. It is mounted
  only while open, so password and secret leave the page once saved.
- Copy names HHN, like the rest of the ILIAS feature; Rust only knows HHN's sign-on so far.

### Phase 4 — Face pipeline in Rust (no UI)

- **Models** loaded once from `app.path().resource_dir()` (bundled through
  `tauri.conf.json` `bundle.resources`), with fixed input shapes for tract.
- **detect.rs** — YuNet 2023mar: multi-stride outputs (`cls_*`, `obj_*`, `bbox_*`, `kps_*`),
  decode, score threshold, NMS. Exactly one face required; zero or several → prompt.
- **align.rs** — similarity transform (Umeyama) from YuNet's 5 landmarks to the standard
  112×112 template `[(38.2946, 51.6963), (73.5318, 51.5014), (56.0252, 71.7366),
(41.5493, 92.3655), (70.7299, 92.2041)]`, bilinear warp.
- **embed.rs** — SFace → 128 floats, L2-normalise. Cosine similarity. OpenCV's same-person
  threshold for SFace is 0.363; for unlocking start stricter (0.50) and calibrate (below).
- **liveness.rs**
  - MiniFASNet V2: crop the face box scaled 2.7× to 80×80, softmax, "real" probability.
  - **Challenge from landmarks:** YuNet gives eyes, nose and mouth corners — no eyelids, so
    **no blink**. Use yaw (nose x against the eye midpoint, normalised by eye distance) for
    "turn left" / "turn right", and face-box growth ≥ 25 % for "come closer".
- **attempt.rs** — pure state machines fed with per-frame observations:
  - Enrolment: 8 good frames (centred, then slight left and right) → averaged, re-normalised
    template.
  - Unlock: two random challenges, 10 s total; every accepted frame must match the template and
    pass anti-spoof; a frame that does not match resets the challenge (no swapping faces
    mid-way).
  - After 3 failed unlocks: locked until a manual sign-in succeeds or 5 minutes pass.
- **Calibration:** a dev command that logs similarity and anti-spoof scores. Try the student,
  two other people, a phone photo, a phone video, a printout. Write the numbers into
  `docs/face-unlock.md` and set the thresholds from them.
- **Tests:** NMS and decode on synthetic tensors; alignment on a known transform (round trip
  within 1 px); cosine; yaw sign and size; every state-machine transition (timeout, wrong
  person, spoof score, success); model-load smoke test (runs in CI if the models are committed;
  record the time).

### Phase 5 — Face UI and wiring

- `camera.ts`: `getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })`,
  draw to a canvas, `toBlob('image/jpeg', 0.85)` at about 6 fps, send as raw IPC bytes
  (`invoke(cmd, bytes)`; in Rust `tauri::ipc::Request`, `InvokeBody::Raw`). `stop()` ends
  every track — on close, success, failure, unmount and window blur.
- Commands:
  - `face_enroll_start`, `face_enroll_frame(bytes) -> Progress`, `face_enroll_finish`.
  - `face_unlock_start -> Challenge[]`, `face_unlock_frame(bytes) -> Progress | Done(outcome)`,
    `face_unlock_cancel`.

  On success `face_unlock_frame` runs Phase 2 itself and returns the sign-in outcome.

- `CameraView`: mirrored video, oval guide, one prompt at a time in `aria-live="polite"`
  ("Turn your head to the left"), visible camera-on indicator.
- `FaceEnrollDialog`, `FaceUnlockDialog` on the existing `Modal`. Always a
  **Sign in with password instead** button.
- **The camera turns on only after a click.** Never on app start, never in the background.
- `FailureNotice`: **Unlock with your face** when face + credentials are set up. After success,
  retry the sync (`withRenewal` path).
- **Tests:** `FaceUnlock.test.tsx` with `renderApp`, stubbed `navigator.mediaDevices`, mocked
  `invoke`: success, wrong face, cancel stops the camera tracks, lockout after 3, fallback to
  manual sign-in. Accessible names and roles throughout.

### Phase 6 — Platforms, packaging, privacy, docs

- `Info.plist`: `NSCameraUsageDescription` — "Uni Pilot uses the camera only when you choose to
  sign in with your face. Pictures stay on this Mac and are never saved."
- Once `hardenedRuntime` is turned on: entitlement `com.apple.security.device.camera`.
- Windows: WebView2 camera permission prompt; Credential Manager.
- Linux: WebKitGTK media stream; Secret Service needs a running keyring (GNOME Keyring /
  KWallet) — say so in Settings when it is missing.
- Bundle size before/after per platform; prefer SFace int8.
- `THIRD-PARTY-LICENSES.md` + `licenses/`: YuNet (MIT), SFace (Apache-2.0, `licenses/apache-2.0.txt`
  exists), MiniFASNet (Apache-2.0), tract, keyring, totp-rs.
- Docs: new `docs/face-unlock.md` (flow, storage, threat model, calibration numbers); update
  `docs/ilias-window.md` sections "What is stored, and what is not" and "The rule ILIAS is shown
  under"; update the `FailureNotice` copy ("ILIAS ends its sign-in when Uni Pilot quits…").
- Consider a `CLAUDE.md` rule: _"Secrets stay in Rust. Passwords, authenticator secrets, face
  templates and session cookies never cross to the page."_

### Phase 7 — Optional: other gates

Touch ID / Windows Hello as an alternative to the face, through `tauri-plugin-biometry`
(MIT; macOS + Windows 11; Keychain items behind biometry on macOS need proper signing). Gives
Linux and camera-less setups nothing new, but makes the Phase 3 button shippable.

## 7. Threat model

| Threat                           | Mitigation                                                                           | Left over                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| Someone at the unlocked laptop   | Face must match on every frame                                                       | —                                         |
| Photo / printout                 | MiniFASNet + head-turn challenge + identity on every frame                           | Good photos on a phone may pass the model |
| Video replay                     | Random challenge order, 10 s limit                                                   | A prepared video of all moves             |
| Stolen laptop, locked            | Keychain locked with the Mac login                                                   | —                                         |
| Script in Uni Pilot's page (XSS) | Page never gets secrets; commands accept frames only; ILIAS view has no capabilities | Could start a camera prompt               |
| Account lockout at HHN           | One password POST and one code POST per unlock; stop on any unknown page             | —                                         |
| Secrets in logs or crash output  | Names only in logs; `Zeroizing`; no `Debug` on secret types                          | —                                         |
| Malware running as the student   | Keychain asks before another app reads the item                                      | Out of scope                              |
| Two factors on one device        | Opt-in, explained in Settings                                                        | Real — that is the trade-off              |

## 8. Privacy (GDPR Art. 9 — biometric data)

- Opt-in with a plain explanation before the camera turns on.
- Stored: one 128-number template in the Keychain. No images, ever — frames are dropped after
  each call.
- **Forget** deletes the template and the credentials immediately.
- Nothing leaves the computer; no telemetry about faces or scores.
- Test fixtures: synthetic tensors only. Face photos for calibration stay local and are not
  committed.

## 9. Baseline on this branch (03.10.2026)

- `npm run check`: ✅ 123 test files, 1281 passed, 1 skipped.
- `cargo test --manifest-path src-tauri/Cargo.toml`: ✅ 159 passed, 0 failed.

## 10. Research summary (02.10.2026)

- Passkeys in WKWebView need HHN to name Uni Pilot in an AASA file, or Apple's browser
  entitlement. `ASWebAuthenticationSession` supports passkeys, but the sign-in ends up in Safari's
  cookies, not Uni Pilot's. → not possible on macOS without HHN.
- WebView2 on Windows supports passkeys with Windows Hello — may work in the ILIAS view already
  (untested).
- Webcam face recognition is spoofable; Windows Hello's IR camera was beaten by an IR printout.
- Model licences: YuNet MIT, SFace Apache-2.0, MiniFASNet Apache-2.0. **Not** InsightFace's
  `buffalo_*` / ArcFace packs (non-commercial only).

## 11. Open questions

| #   | Question                                                                                                                                                             | Who            | Blocks  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------- |
| Q1  | Team sign-off on storing the password and authenticator secret                                                                                                       | Ermir + Refik  | merge   |
| Q2  | HHN's code page and any page in between                                                                                                                              | Ermir (Safari) | Phase 2 |
| Q3  | How long does HHN's Keycloak session last (idle / max)?                                                                                                              | measure        | —       |
| Q4  | May students keep the authenticator secret in an app (HHN rules)?                                                                                                    | HHN IT         | ship    |
| Q5  | Does Keycloak at HHN lock accounts after failed codes, and after how many?                                                                                           | HHN IT / test  | Phase 2 |
| Q6  | tract fast enough, or `ort`?                                                                                                                                         | Phase 0.5      | Phase 4 |
| Q7  | Apple Developer account for proper signing (Keychain prompts, Touch ID)?                                                                                             | team           | Phase 7 |
| Q8  | ~~Was Safari's Touch ID sign-in a passkey?~~ No: HHN offers passkeys as a second factor; this account has none, so it was Keychain filling the password (03.10.2026) | Ermir          | —       |

## 12. Phase 0 results

**0.1 — Baseline.** ✅ As in §9; the branch was unchanged when Phase 0 started (HEAD `dfb5498`).

**0.2 — HHN's pages.** ✅ (03.10.2026). Four fixtures in `src-tauri/src/ilias_sync/fixtures/`, each
with a header saying how it was made. Redacted everywhere: `session_code`, `execution`, `tab_id`,
**`client_data`**, the hash passed to `checkAuthSession()`, and the user name.

Password page (`keycloak-login.html`, curl, no account):

- Redirect chain: `GET /openidconnect.php` → **one** 302 to
  `/realms/hhn/protocol/openid-connect/auth` (`client_id=hhn_common_ilias`,
  `redirect_uri=https://ilias.hs-heilbronn.de/openidconnect.php`, `scope=openid openid`, plus
  `nonce`, `state`; no PKCE) → 200 password page. Two hosts only.
- **ILIAS sets no cookie at hop 1** for a client without one. Its `state` lives elsewhere, so
  Rust's flow cannot finish at ILIAS anyway — another reason for §4.2's "stop at the redirect".
- Keycloak sets `AUTH_SESSION_ID`, `KC_RESTART` (Secure, HttpOnly, `Path=/realms/hhn/`,
  `SameSite=None`, RFC 2109 `Version=1`), `KC_AUTH_SESSION_HASH` (not HttpOnly, `Max-Age=60`),
  and **`hhn-login-bs`** (`path=/`, neither Secure nor HttpOnly — looks like load-balancer
  stickiness). `jar.rs` must path-match `/realms/hhn/` and keep `hhn-login-bs`, or the POST may
  reach another node; `handoff.rs` copies it too.
- Keycloak ≥ 26.1 (`client_data`, `startSessionPolling`); theme `hhn` on the v1 login theme
  (PatternFly 4 classes). Form exactly as §3, no WebAuthn on it.
- The locale links also point at `login-actions/authenticate`: read the action from
  `#kc-form-login` only.
- Keycloak answers in the language of `Accept-Language` (German for curl, English in the pane):
  classify by form ids, never by wording.

Code page (`keycloak-otp.html`, from the browser pane's network log with a real account):

- **The password POST answers 200 with the code page itself** — no redirect, no page in between.
  `keycloak.rs` classifies POST response bodies, not only redirect targets. A `<SCRIPT>` with
  `history.replaceState` hides `session_code` from the address bar; irrelevant over HTTP.
- `#kc-otp-login-form`: input `otp` (`autocomplete="one-time-code"`), submit `login`. **No
  `selectedCredentialId`** with one authenticator app — keep the radios optional.
- A second form, `#kc-select-try-another-way-form` (hidden `tryAnotherWay=on`), whenever the
  account has another method. `classify` must pick `#kc-otp-login-form` by id, not "the form".
- `#kc-attempted-username` shows the user name (the email worked as user name).
- `client_data` is base64 JSON `{"ru": redirect_uri, "rt": "code", "st": state}` — it carries
  ILIAS's `state`, so it is redacted like the rest.

"Try another way" (`keycloak-select-method.html`):

- `#kc-select-credential-form`, one submit button per method (`name="authenticationExecution"`).
  This account: **Authenticator Application** and HHN's **"Lost your second factor?"**.
- Keycloak shows this page only when asked; it is a negative fixture. `classify` → `Unknown` →
  `Unrecognised`, no POST.

Wrong password (`keycloak-login-error.html`) is **derived** from the recorded password page and
Keycloak 26's `login.ftl` — no wrong password was sent to HHN. It carries `#input-error` under the
user name and no page-wide alert. The same message stands for an unknown user, a wrong password
and a temporarily locked account, so `WrongPassword` cannot tell them apart.

Account page (`/realms/hhn/account/account-security/signing-in`): password, authenticator app,
recovery codes, and **Passkey — "Use your Passkey to sign in."**, which is Keycloak's
`webauthn-help-text`: the **two-factor** passkey, not the passwordless one (that would read "…for
passwordless sign in" under a "Passwordless" heading). Not set up on this account, so the Touch ID
sign-in seen in Safari was Keychain filling the password (Q8; `docs/ilias-window.md` "Signing in
with Touch ID" needs correcting). Suggests 0.7: Uni Pilot as its own second factor, so no copy of
the authenticator secret is stored. The password still is. "Device activity" on the same page
shows each session's start and expiry — a way to measure Q3.

**0.3 — Cookies set from Rust count for Keycloak.** ✅ **macOS** (03.10.2026); Windows open.
Throwaway `src-tauri/src/spike_handoff.rs` (debug builds, `UNIPILOT_SPIKE=handoff`), run after a
real sign-in in the dev app:

- Sign-on cookies after a sign-in, all host-only on `login.hs-heilbronn.de`, `SameSite=None`:
  `KEYCLOAK_IDENTITY` (Secure, HttpOnly, **session**), `KEYCLOAK_SESSION` (Secure, not HttpOnly,
  **persistent**), `AUTH_SESSION_ID`, `KC_RESTART` (Secure, HttpOnly, session; all
  `/realms/hhn/`), `hhn-login-bs` (`/`, session). `KEYCLOAK_IDENTITY` being a session cookie is
  why a restart asks for the password again. `KEYCLOAK_SESSION`'s expiry would answer Q3 — log it
  next time (a date, not a secret).
- Deleted those and ILIAS's cookies → none left → `ilias_sync_reauth` **needs the student**
  (control). Set the sign-on cookies back, **rebuilt** like `handoff.rs` will (fresh `Cookie`, host
  named as domain) → `ilias_sync_reauth` **worked**. So `set_cookie` reaches the cookie store the
  hidden window uses, and Keycloak accepts the cookies.
- Not yet shown: cookies Keycloak issued to **reqwest** rather than to WebKit. Keycloak does not
  bind sessions to User-Agent or IP by default, so this should hold; Phase 2's dev button proves
  it end to end.

**0.4 — The camera works in Uni Pilot's window.** ✅ **macOS** (03./04.10.2026); Windows and Linux
open. Throwaway `src-tauri/src/spike_camera.rs` (debug builds, `UNIPILOT_SPIKE=camera`): a panel
injected into Uni Pilot's **own** page — never ILIAS's — reporting through an event. Run as a
**bundled** debug app started with `open --env …`, so macOS asks for Uni Pilot itself and not for
the terminal or the Claude app that launched `tauri dev`. `NSCameraUsageDescription` added to
`Info.plist` with §6 Phase 6's wording.

- The page is `tauri://localhost`, a **secure context**; `navigator.mediaDevices.getUserMedia`
  exists.
- First **Start camera**: macOS's own camera prompt, for Uni Pilot (as Ermir saw it); granted after 2.6 s, 640×480 at 30 fps as asked. 18 frames
  at ~6 fps: JPEG q 0.85 ≈ 49–81 KB, encoded in 6–8 ms, mean brightness 87–104 (a real picture).
  ~6 fps × ~80 KB ≈ 0.5 MB/s over IPC — fine for raw IPC bytes (Phase 5).
- **Stop** ends every track (`readyState` `ended`). Second start: granted in **9 ms**, no prompt.
- Expected, not yet seen: with ad-hoc signing every rebuild is a new identity, so macOS may ask
  again after each update — same cause as Phase 0.6.

**0.5 — tract-onnx is fast enough.** ✅ for detection and recognition (03.10.2026, Apple **M3**,
release build, one thread, 30 runs after 3 warm-ups; throwaway crate outside the repo).

| Model (opencv_zoo, SHA-256 prefix)                               | Input   | Load   | Median per run |
| ---------------------------------------------------------------- | ------- | ------ | -------------- |
| `face_detection_yunet_2023mar.onnx` (`8f2383e4…`, 232 KB)        | 640×480 | 23 ms  | **34 ms**      |
| same                                                             | 320×256 | 22 ms  | **12 ms**      |
| same, as published                                               | 640×640 | 39 ms  | 60 ms          |
| `face_recognition_sface_2021dec.onnx` (`0ba9fbfa…`, 38.7 MB)     | 112×112 | 110 ms | **27 ms**      |
| `face_recognition_sface_2021dec_int8.onnx` (`2b0e941e…`, 9.9 MB) | —       | fails  | —              |

- **YuNet has 640×640 written into its intermediate shapes.** Load it with
  `onnx().with_ignore_value_info(true).with_ignore_output_shapes(true)` and a fixed input fact;
  both sides must be multiples of 32 (320×240 fails in a `Reshape`). Outputs as expected:
  `cls/obj/bbox/kps` × strides 8/16/32.
- **SFace int8 does not load in tract** (`QLinearMul` unimplemented). Ship fp32 (+38.7 MB) — or
  convert to fp16 later, or switch to `ort` only for that. §5's "prefer int8" does not hold with
  tract.
- Detection at 320×256 plus recognition ≈ 40 ms, at 640×480 ≈ 60 ms, before MiniFASNet (80×80,
  ~0.4 M parameters, expected a few ms). An M1 at ~30 % slower stays far below the 150 ms budget.
- **MiniFASNet still open:** there is no official ONNX. Candidates: convert minivision-ai's
  `2.7_80x80_MiniFASNetV2.pth` (Apache-2.0) ourselves with PyTorch, or a third-party ONNX whose
  licence and origin are checked first.
- Full SHA-256 for `models/README.md`:
  `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` (YuNet),
  `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` (SFace fp32).

**0.6 — The Keychain asks once per update, if the student picks "Always Allow".** ✅ (04.10.2026,
macOS, `keyring` 3.6.3 `apple-native`, throwaway CLI outside the repo, a dummy value only, deleted
afterwards). Build A wrote and read; build B — same code, new ad-hoc CDHash, i.e. "Uni Pilot after
an update" — read A's item:

| Who reads                  | What macOS did                                             |
| -------------------------- | ---------------------------------------------------------- |
| A, the build that wrote it | no prompt, 8 ms                                            |
| B, first read              | Keychain prompt naming the program                         |
| B after **Allow**          | **asked again on the next read**                           |
| B after **Always Allow**   | no prompt from then on (8 ms); needs the Mac password once |
| A afterwards               | still no prompt                                            |
| B deleting the item        | no prompt                                                  |

- So with ad-hoc signing: **one prompt with the Mac password per update** — every update for
  "Allow". Settings has to say so; proper signing (Q7) removes it, because the Keychain then trusts
  team + bundle id instead of one CDHash.
- The prompt comes when the face template is loaded, i.e. at the start of an unlock, before the
  camera — the right order. Do not start the camera until that read has succeeded.
- **Deny / Cancel arrive as `keyring::Error::PlatformFailure`**, not `NoStorageAccess`
  (`decode_error` maps only -25291/-25292/-25294/-25295 to that). Phase 1 inspects the inner
  `OSStatus` (-128 `errSecUserCanceled`, -25293 `errSecAuthFailed`) to say "you refused".
- `keyring` is at **4.2** now and has no `apple-native` feature any more (stores split into separate
  crates). The plan's `keyring` 3 works; whether to move to 4 is a Phase 1 decision.
- Tested with a CLI; the bundled app uses the same mechanism (ad-hoc = CDHash).

**Face recognition, end to end (a Phase 4 sketch).** ✅ recognises the enrolled student (04.10.2026,
macOS, M3). Throwaway `src-tauri/src/spike_face.rs` (debug builds, `UNIPILOT_SPIKE=face`,
`UNIPILOT_MODELS=<folder>`): camera → JPEG as raw IPC bytes (`tauri::ipc::Request`,
`InvokeBody::Raw`, mode in an `x-face-mode` header) → YuNet decode as OpenCV's `FaceDetectorYN`
(score √(cls·obj) ≥ 0.85, NMS 0.3) → least-squares similarity onto the 112×112 template (unit
tests: identity, and a 2×/20°/shifted face mapped back within 0.01 px) → SFace (RGB 0–255) →
L2-normalised → cosine. Template = mean of 5 frames, in memory only. No anti-spoofing.

| Enrolment (lowest pair similarity) | Checks | Similarity min / mean / max | ≥ 0.50  |
| ---------------------------------- | ------ | --------------------------- | ------- |
| 1 (0.985, held still)              | 69     | 0.70 / 0.90 / 0.97          | 69/69   |
| 2 (0.741, moving)                  | 84     | 0.73 / 0.86 / 0.92          | 84/84   |
| 3 (0.957)                          | 130    | 0.67 / 0.81 / 0.93          | 130/130 |

- The student is never rejected; worst 0.67 against a 0.50 threshold. Faces were 138–177 px wide —
  all at laptop distance.
- **Not yet measured: anyone else.** No other person, no photo, no video — so nothing about false
  accepts, and the threshold stays uncalibrated. That is Phase 4's calibration, now with a tool.
- In the debug build a frame took ~116 ms detect + ~80 ms embed, against 34 + 27 ms in the
  release benchmark: the input tensors are filled by our own unoptimised code (and `ndarray`). Not
  a concern for release; for development, build tensors from slices or optimise `ndarray` too.
- The test process had no network connection open (`lsof`), and the code has no network calls.
  Logs carry numbers only — no frames, no template values.

## 13. Starting the next chat

Open Claude Code in `/Users/mili/Coding/Uni-Pilot-face` and start with:

> Read `docs/face-unlock-plan.md`, `docs/ilias-window.md` and
> `src-tauri/src/ilias_sync/reauth.rs`. Then do Phase 0 of the plan, one spike at a time, and
> report each result before moving on.
