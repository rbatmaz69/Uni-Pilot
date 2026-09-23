# ILIAS window

Open **ILIAS** in the sidebar, choose **Connect Hochschule Heilbronn** (or enter another ILIAS address), then **Open ILIAS**. ILIAS appears in a window of its own inside Uni Pilot. Sign in there exactly as on the website; the sign-in stays on this computer and survives restarting the app.

Why a window rather than native screens: at Heilbronn, ILIAS gives Uni Pilot one data channel — the calendar feed — and nothing for courses, materials, submissions, forums or tests. The research behind this is in [`integrations/ilias-integration-research.md`](integrations/ilias-integration-research.md). Rather than leave all of that out of reach, the app opens ILIAS itself.

## What the page does

| Action                | What happens                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Connect**           | Uni Pilot asks the address what it is — release, client, how people sign in — and keeps the answer. No password is involved.          |
| **Open ILIAS**        | Opens the ILIAS dashboard, not the root. Signed in, that is your own start page; signed out, ILIAS sends you through its login first. |
| **Check again**       | Asks the installation again, for instance after the university upgrades ILIAS.                                                        |
| **Sign out of ILIAS** | Opens ILIAS's own `logout.php` in the window, which ends the session ILIAS knows about.                                               |
| **Disconnect**        | Makes Uni Pilot forget the address. It does not sign you out of ILIAS — do that first if you want to.                                 |

In the calendar, an entry that came from an ILIAS feed shows **Open in ILIAS**. ILIAS writes a link to the course or exercise into every entry it exports, so this opens the exercise itself rather than the start page. Timetable entries from splan carry no link and show nothing.

## What is stored, and what is not

Stored, in `localStorage` under `uni-pilot.ilias`: the university's name, the ILIAS address, its client id, its release, how its login page lets people sign in, and when it was last checked.

**Not stored anywhere by Uni Pilot:** no password, no token, no session id. Your sign-in lives only in the ILIAS window's own cookies, the same way it would in a browser.

## The rule the window is built around

**Uni Pilot never injects script into the ILIAS window.** No initialisation script, no `eval`, nothing that reads the page, fills in the login form or watches what you type. You enter your university password there; the window is a browser and nothing else.

Two things make that more than a promise:

- The window is created in Rust (`src-tauri/src/ilias_window.rs`), which is the only place that can open it. The permission that would let the webview create windows itself has no URL scope and is not granted.
- A window showing a remote page gets no access to the app's commands unless a capability grants it. `capabilities/default.json` names only the main window, so ILIAS cannot call into Uni Pilot.

## What may be opened

Every "open in ILIAS" goes through one rule, in Rust for the desktop window and mirrored in TypeScript for the browser:

- No target opens the dashboard with the client id — never the root, which at Heilbronn is the public, signed-out repository.
- A `crs_717`-style shorthand becomes a `goto.php` link.
- A full link is only accepted from the connected installation's origin, with the client id added if it is missing and refused if it names a different client. Deep links arrive inside calendar feeds, so they count as outside input.

Once open, the window navigates freely — it has to, or the university's single sign-on could not run. Only what the app opens is checked.

## Desktop and browser behaviour

The desktop app opens one ILIAS window and reuses it: opening again brings it forward at the new page. Closing it is fine; the sign-in is kept.

In a browser tab (`npm run dev`), ILIAS opens in a new tab instead. Connecting works there too, through a dev-only relay in `vite.config.ts` (`/__ilias`), because ILIAS sends no CORS headers and the browser would otherwise refuse every request. The relay never reaches a build.

## Implementation and validation

- `src-tauri/src/ilias_window.rs` — the window and `resolve_target`, with Rust tests.
- `src/features/integrations/lib/ilias/endpoints.ts` — `resolveIliasTarget`, `dashboardUrl`; the TypeScript mirror of the rule.
- `src/features/integrations/lib/ilias/connection.ts` — `discoverInstallation`, which now also reads the sign-in options, and `toConnection`.
- `src/features/integrations/lib/ilias/knownInstallations.ts` — Heilbronn, as configuration rather than a special case.
- `src/features/integrations/lib/iliasWindow.ts` — `openIlias`, choosing between the window and a tab.
- `src/features/integrations/store/iliasStore.ts` — the connected installation.
- `src/features/integrations/components/` — the ILIAS page and the calendar's **Open in ILIAS** button.

`resolve_target` in Rust and `resolveIliasTarget` in TypeScript are tested against the same cases. Change both or neither.

Run `npm run check`, then `cargo test --manifest-path src-tauri/Cargo.toml` for the Rust rule. `npm run test:ilias` with `ILIAS_LIVE_BASE_URL` set checks discovery against a real installation.

## Still to be confirmed

**Whether Heilbronn's sign-in works inside an embedded window** has not been tried: it needs the desktop app, and so a Rust toolchain. Heilbronn signs in through Keycloak (`login.hs-heilbronn.de`), which — unlike Google or Microsoft — does not refuse embedded browsers by itself. If it turns out not to work, the fallback is opening ILIAS in the system browser, which needs `tauri-plugin-opener`.

Also untested in a packaged build: whether `tauri-plugin-http` honours `redirect: 'manual'`, which discovery relies on to tell a blocked SOAP endpoint from a redirect.
