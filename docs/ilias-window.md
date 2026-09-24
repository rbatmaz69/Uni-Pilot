# ILIAS in Uni Pilot

Open **ILIAS** in the sidebar and choose **Connect Hochschule Heilbronn** (or enter another ILIAS address). In the desktop app the window then switches to **ILIAS mode**: ILIAS fills it, full width, under a slim strip of Uni Pilot's own. The sidebar steps aside while you are there; **Uni Pilot** at the left of the strip takes you back. Sign in exactly as on the website; the sign-in stays on this computer and survives restarting the app.

Why ILIAS itself rather than native screens: at Heilbronn, ILIAS gives Uni Pilot one data channel — the calendar feed — and nothing for courses, materials, submissions, forums or tests. The research behind this is in [`integrations/ilias-integration-research.md`](integrations/ilias-integration-research.md). Rather than leave all of that out of reach, the app shows ILIAS.

## What the page does

| Control                          | What happens                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Connect**                      | Uni Pilot asks the address what it is — release, client, how people sign in — and keeps the answer. No password is involved. |
| **Uni Pilot** (back)             | Leaves ILIAS mode for the page you came from; the sidebar and header return.                                                 |
| **‹ ›** (back, forward)          | Back and forward within ILIAS, like a browser. Greyed out when there is nowhere to go. On a Mac, two-finger swipe works too. |
| **ILIAS dashboard** (house)      | Back to the ILIAS dashboard. Signed in, that is your own start page; signed out, ILIAS sends you through its login first.    |
| **Open in your browser** (globe) | The page ILIAS is on, in your default browser. For signing in with Touch ID — see below.                                     |
| **Open in a separate window**    | The same ILIAS in a window of its own — the fallback if the embedded view misbehaves.                                        |
| **Sign out of ILIAS**            | Opens ILIAS's own `logout.php`, which ends the session ILIAS knows about.                                                    |
| **Disconnect**                   | Makes Uni Pilot forget the address. It does not sign you out of ILIAS — do that first if you want to.                        |

In the calendar, an entry that came from an ILIAS feed shows **Open in ILIAS**. ILIAS writes a link to the course or exercise into every entry it exports, so this goes to the ILIAS page and opens the exercise itself rather than the start page. Timetable entries from splan carry no link and show nothing.

Leaving the ILIAS page and coming back finds ILIAS where you left it.

## Downloads

A file ILIAS offers for download — slides, exercise sheets, a submission you uploaded — is saved to your **Downloads** folder. The strip says so while it runs (**Downloading Blatt 3.pdf…**) and when it is done (**Blatt 3.pdf saved to Downloads**), or that it failed. A saved file can be opened from there, or shown in its folder.

Before this, downloads did not work at all, for two reasons. A webview without a download handler cancels every download, silently. And ILIAS opens every file it shows inline — PDFs above all — in a new window (`target="_blank"`, see `ilObjFileListGUI::getCommandFrame` in ILIAS 9), which a webview without a handler for new windows simply refuses. Clicking a PDF did nothing, and nothing said so.

A third case turned up with a student's own submissions: ILIAS sends those as an attachment (`Content-Disposition: attachment`) through an ordinary link. A browser saves an attachment; the macOS webview, as Tauri sets it up, only asks whether it can display the file type — and for a PDF it can, so the submission was shown instead of saved. Uni Pilot now gives the ILIAS webview's navigation delegate a subclass that answers `attachment` with a download and leaves every other response to Tauri unchanged (`honour_attachments` in `src-tauri/src/ilias_browser.rs`). Only the ILIAS webview is changed, not Uni Pilot's own. WebView2 on Windows honours attachments on its own; WebKitGTK on Linux cannot display PDFs and downloads them anyway.

Links that ask for a new window now go where a browser's new tab would (`src-tauri/src/ilias_links.rs`):

- **To ILIAS itself** (same origin), Uni Pilot asks for the link once, with the ILIAS view's own cookies. A file is saved to Downloads like any other download; a page opens in the ILIAS view.
- **To anywhere else** — `http`, `https`, `mailto` — your default browser or mail app.
- **Anything else** is refused.

How it is kept safe (`src-tauri/src/ilias_browser.rs`):

- **The file name is ours to check.** The server suggests one; Uni Pilot keeps only the last part — no folders, so nothing can land outside Downloads — replaces what file systems refuse, drops leading dots so nothing is hidden, and shortens endless names. An existing file is never overwritten: the new one becomes `Blatt 3 (1).pdf`.
- **The page never names a path.** Rust hands out an id per download and opens or shows only files it saved itself, looked up by that id. The strip only ever learns the file name.
- **Only documents and media are opened** — PDF, Office and OpenDocument files, text, images, audio, video, zip. Anything else, a program above all, is only ever shown in its folder; opening it stays your own, deliberate step.

Opening a PDF from the strip hands it to Preview (or whatever opens PDFs on your computer).

## ILIAS mode: side by side, not on top

ILIAS forbids being framed (`x-frame-options: SAMEORIGIN`), so this is not an `<iframe>`. It is a second native webview attached to the Uni Pilot window (`Window::add_child`), which Tauri keeps behind its `unstable` feature and describes as unfinished. The separate window in the strip is there in case that shows.

```text
┌──────────────────────────────────────────────┐
│ (title bar, macOS, windowed only)            │
├──────────────────────────────────────────────┤
│ Uni Pilot: the strip — back, home, sign out  │  Uni Pilot's webview
├──────────────────────────────────────────────┤
│ ILIAS, full width                            │  ILIAS's webview
└──────────────────────────────────────────────┘
```

The two webviews sit **side by side and never overlap**. A first version laid ILIAS _over_ the page instead, and that could not be made to work: macOS sends pointer movement to every webview under the pointer, covered or not, so the page underneath and ILIAS kept resetting the cursor over each other and it flickered between the hand and the arrow. Webviews that do not overlap have nothing to fight over.

What follows from that:

- **Rust lays out the window.** Once Uni Pilot is only the strip, the page can no longer see the window, so `src-tauri/src/ilias_view.rs` places both webviews — on entering, and again on every resize and on going full screen and back.
- **The title bar is accounted for.** On macOS the window's content runs up under the title bar and the page starts below it, 28 points down when windowed and 0 in full screen. Measured once on entering, from the gap between the window and the page. Without this the strip landed 28 points too high, under the title bar, which is exactly how it disappeared outside full screen.
- **Linux lays out differently.** There Tauri packs all webviews of a window into one vertical GTK box and ignores the positions and sizes set on them. A box shares its height by what each child would like, and a WebKit view would like the height of its page — so first ILIAS got half the window, and after a first fix Uni Pilot kept all of it. On Linux both webviews are therefore moved into a vertical `GtkPaned`, whose divider stays where it is put: at the strip's height, with ILIAS below (`stack` in `ilias_view.rs`). A paned gives all of itself to the one child still visible, so hiding ILIAS is all leaving takes.
- **Dialogs get the window back.** Uni Pilot is only the strip in ILIAS mode, so a dialog would be cut off at its edge. While one is open, Uni Pilot takes the window back; afterwards ILIAS returns on the page it was on. Not for tooltips or reminders, which would make ILIAS jump out of the way on hover or mid-sentence. On macOS reminders come from a native overlay above everything; on other platforms an in-app reminder shown in ILIAS mode is cut off at the strip.
- **Leaving hides ILIAS; only Disconnect closes it.** That is what keeps your place.
- **Calls to Rust go strictly in order**, each with a time limit. They are async and could overtake each other — React mounts effects twice in development — and a "leave" that landed after the student's last "enter" would show a strip over an empty window, or the other way round. The limit keeps a call that never returns from holding up every later one.

## Signing in with Touch ID

The university sign-in offers **passkeys**: in Safari, Touch ID or your Mac's password sign you in. Inside Uni Pilot that option does not work, and it cannot be made to: Apple only lets a web browser, or an app on its own domains, use passkeys for a website. The login page in Uni Pilot is neither — it is `login.hs-heilbronn.de`, not Uni Pilot's domain.

What works instead:

- **Your HHN user name and password** in Uni Pilot. You sign in rarely: the sign-in is kept across restarts.
- **Open in your browser** (globe) in the strip, which opens the page ILIAS is on in your default browser, where Touch ID works. That signs in the browser, not Uni Pilot — the two keep their sign-ins apart.

## What is stored, and what is not

Stored, in `localStorage` under `uni-pilot.ilias`: the university's name, the ILIAS address, its client id, its release, how its login page lets people sign in, and when it was last checked.

**Not stored anywhere by Uni Pilot:** no password, no token, no session id. Your sign-in lives only in ILIAS's own cookies, the same way it would in a browser.

One exception to _reading_ it: to fetch a link ILIAS opens in a new window, Rust reads the ILIAS view's cookies for that one request. It sends them only to ILIAS's own origin — same scheme, host and port — follows redirects only within it, keeps nothing, and never hands them to the page.

## The rule ILIAS is shown under

**Uni Pilot never injects script into ILIAS.** No initialisation script, no `eval`, nothing that reads the page, fills in the login form or watches what you type. You enter your university password there; it is a browser and nothing else.

That holds for back and forward too. `history.back()` would have been one line of script; instead Rust calls the platform's webview directly — `WKWebView` on macOS, WebView2 on Windows, WebKitGTK on Linux — which is why `Cargo.toml` names those three crates. They were already there through Tauri and are pinned to the versions it uses.

Two things make that more than a promise:

- Both the embedded view and the separate window are created in Rust (`src-tauri/src/ilias_view.rs`, `src-tauri/src/ilias_window.rs`), the only place that can make them. The permission that would let the page create webviews itself has no URL scope and is not granted.
- A webview showing a remote page gets no access to the app's commands unless a capability grants it. `capabilities/default.json` names only the main window, so ILIAS cannot call into Uni Pilot.

## What may be opened

Every "open in ILIAS" goes through one rule, in Rust for the desktop and mirrored in TypeScript for the browser:

- No target opens the dashboard with the client id — never the root, which at Heilbronn is the public, signed-out repository.
- A `crs_717`-style shorthand becomes a `goto.php` link.
- A full link is only accepted from the connected installation's origin, with the client id added if it is missing and refused if it names a different client. Deep links arrive inside calendar feeds, so they count as outside input. The calendar hands them to the ILIAS page through its address, where they are checked again before anything opens.

Once open, ILIAS navigates freely — it has to, or the university's single sign-on could not run. Only what the app opens is checked.

## In a browser tab

`npm run dev` in a browser cannot embed ILIAS: framing is forbidden and there is no native webview to lay over the page. So there the page offers **Open ILIAS**, which opens a new tab. Connecting still works, through a dev-only relay in `vite.config.ts` (`/__ilias`), because ILIAS sends no CORS headers and the browser would otherwise refuse every request. The relay never reaches a build.

## Implementation and validation

- `src-tauri/src/ilias_view.rs` — ILIAS mode: entering, leaving, laying out the window on every resize, with Rust tests for the layout and the title bar.
- `src-tauri/src/ilias_window.rs` — the separate window, and `resolve_target`, with Rust tests.
- `src-tauri/src/ilias_links.rs` — links ILIAS opens in a new window, and **Open in your browser**, with Rust tests for where a link goes, telling a file from a page, and file names from headers.
- `src-tauri/src/ilias_browser.rs` — back, forward and downloads for both, with Rust tests for file names and the download list.
- `src/features/integrations/lib/iliasBrowser.ts` and `store/iliasBrowserStore.ts` — the commands and events, and what the strip shows. Listening starts once and lasts as long as the app, so a download that ends while you are elsewhere is still heard.
- `src/features/integrations/lib/ilias/endpoints.ts` — `resolveIliasTarget`, `dashboardUrl`; the TypeScript mirror of the rule.
- `src/features/integrations/lib/ilias/connection.ts` — `discoverInstallation`, which also reads the sign-in options, and `toConnection`.
- `src/features/integrations/lib/ilias/knownInstallations.ts` — Heilbronn, as configuration rather than a special case.
- `src/features/integrations/lib/iliasView.ts` — when to switch, the ordered queue, what counts as a dialog.
- `src/features/integrations/lib/iliasWindow.ts` — `openIlias`, choosing between the separate window and a tab.
- `src/features/integrations/store/iliasStore.ts` — the connected installation.
- `src/features/integrations/components/` — the page, the strip (`IliasStrip`), and the calendar's **Open in ILIAS** button.
- `src/components/layout/AppLayout.tsx`, `MainContent.tsx` and `immersive` in `src/store/uiStore.ts` — the sidebar and header stepping aside. `immersive` is never persisted, so a crash in ILIAS mode cannot start the app without its sidebar.

`resolve_target` in Rust and `resolveIliasTarget` in TypeScript are tested against the same cases. Change both or neither.

Run `npm run check`, then `cargo test --manifest-path src-tauri/Cargo.toml` for the Rust side. `npm run test:ilias` with `ILIAS_LIVE_BASE_URL` set checks discovery against a real installation.

## Confirmed, and still open

- ✅ **Heilbronn's sign-in works inside an embedded webview.** Confirmed on 23.09.2026 by signing in to the dashboard with a real HHN account. Heilbronn signs in through Keycloak (`login.hs-heilbronn.de`), which — unlike Google or Microsoft — does not refuse embedded browsers.
- 🔴 **ILIAS mode on every platform.** Rust computes the layout and handles the title bar, but Tauri has open issues about child webviews, and resizing the main webview goes further into its unfinished API than laying one over it did. Check it by eye after a Tauri update, on each platform you ship to — windowed, full screen, and resizing between the two.
- 🔴 **Back, forward and downloads on Windows and Linux.** Written against each platform's webview and type-checked for Windows, but only tried on macOS. On macOS the webview does not report where a download went, so Uni Pilot chooses the path itself; check the file lands in Downloads on the others.
- 🔴 **Links ILIAS opens in a new window** are fetched once by Rust to tell a file from a page, and a page is then loaded a second time by the ILIAS view. Harmless for ILIAS's links, which only read; watch for anything that behaves differently when opened twice.
- 🔴 **Whether `tauri-plugin-http` honours `redirect: 'manual'`** in a packaged build. Discovery relies on it to tell a blocked SOAP endpoint from a redirect.
