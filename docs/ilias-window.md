# ILIAS in Uni Pilot

Open **ILIAS** in the sidebar and choose **Connect Hochschule Heilbronn** (or enter another ILIAS address). In the desktop app the window then switches to **ILIAS mode**: ILIAS takes the place of the page's card, to the right of Uni Pilot's icon rail and an **ILIAS panel** that carries the controls below. The rail stays where it is, so any item on it takes you back into Uni Pilot. Sign in exactly as on the website. The sign-in lasts as long as Uni Pilot runs — on a Mac, closing the window only hides the app — but not past quitting it: ILIAS keeps its session in a session cookie, and after a restart the university's sign-in asks for the password and the authenticator code again (measured 25.09.2026).

Why ILIAS itself rather than native screens: at Heilbronn, ILIAS gives Uni Pilot one data channel — the calendar feed — and nothing for courses, materials, submissions, forums or tests. The research behind this is in [`integrations/ilias-integration-research.md`](integrations/ilias-integration-research.md). Rather than leave all of that out of reach, the app shows ILIAS.

## What the page does

| Control                          | What happens                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connect**                      | Uni Pilot asks the address what it is — release, client, how people sign in — and keeps the answer. No password is involved.                                                      |
| **The icon rail**                | The way back to Uni Pilot: any item on it leaves ILIAS mode for that page, and the header and the card return. There is no "back to Uni Pilot" button of its own.                 |
| **‹ ›** (back, forward)          | In the panel's header. Back and forward within ILIAS, like a browser. Greyed out when there is nowhere to go. On a Mac, two-finger swipe works too.                               |
| **ILIAS dashboard** (house)      | In the panel's header. Back to the ILIAS dashboard. Signed in, that is your own start page; signed out, ILIAS sends you through its login first.                                  |
| **Courses**                      | The panel's list of your courses, as Uni Pilot last read them (below). A click opens that course in ILIAS; the course ILIAS is showing is marked.                                 |
| **Open in your browser** (globe) | In the panel's foot. The page ILIAS is on, in your default browser. For signing in with Touch ID — see below.                                                                     |
| **Open in a separate window**    | In the panel's foot. The same ILIAS in a window of its own — the fallback if the embedded view misbehaves.                                                                        |
| **Sign out of ILIAS**            | In the panel's foot. Signs out the way ILIAS's own menu does, then makes this computer forget the university sign-on, so the next sign-in asks for the password again. See below. |
| **Disconnect**                   | In the panel's foot. Makes Uni Pilot forget the address. It does not sign you out of ILIAS — do that first if you want to.                                                        |

**Courses in the panel** come from the course list Uni Pilot keeps (`courseStore`, the same one the Courses page reads): online courses and groups of this installation, in ILIAS's order, by name without the module number. The panel does not read ILIAS itself; `CourseSync` refreshes the list every 15 minutes while Uni Pilot runs, and once more on leaving ILIAS mode if the sign-in was missing. A first sign-in made in ILIAS mode therefore shows its courses after the next refresh, not at once. A click goes through the same rule as every other "open in ILIAS" (`resolveIliasTarget`, `crs_717`). **Which course is marked** comes from Rust: every finished page in ILIAS reports the `ref_id` (or `target=crs_717`) of its own address, and only that number reaches the page (`ilias-location`, `ref_id_of` in `ilias_browser.rs`). Inside a folder of the course the id is the folder's, so no course is marked there.

**The panel stays open in ILIAS mode**, whatever the student chose for panels (`selectPanelShown` in `uiStore.ts`): it holds ILIAS's only controls and ILIAS mode has no header to bring a hidden panel back from. The preference itself is not touched and applies again afterwards.
In the calendar, an entry that came from an ILIAS feed shows **Open in ILIAS**. ILIAS writes a link to the course or exercise into every entry it exports, so this goes to the ILIAS page and opens the exercise itself rather than the start page. Timetable entries from splan carry no link and show nothing.

Leaving the ILIAS page and coming back finds ILIAS where you left it.

## Downloads

A file ILIAS offers for download — slides, exercise sheets, a submission you uploaded — is saved to your **Downloads** folder. The panel's foot says so while it runs (**Downloading Blatt 3.pdf…**) and when it is done (**Blatt 3.pdf saved to Downloads**), or that it failed. A saved file can be opened from there, or shown in its folder.

Before this, downloads did not work at all, for two reasons. A webview without a download handler cancels every download, silently. And ILIAS opens every file it shows inline — PDFs above all — in a new window (`target="_blank"`, see `ilObjFileListGUI::getCommandFrame` in ILIAS 9), which a webview without a handler for new windows simply refuses. Clicking a PDF did nothing, and nothing said so.

A third case turned up with a student's own submissions: ILIAS sends those as an attachment (`Content-Disposition: attachment`) through an ordinary link. A browser saves an attachment; the macOS webview, as Tauri sets it up, only asks whether it can display the file type — and for a PDF it can, so the submission was shown instead of saved. Uni Pilot now gives the ILIAS webview's navigation delegate a subclass that answers `attachment` with a download and leaves every other response to Tauri unchanged (`honour_attachments` in `src-tauri/src/ilias_browser.rs`). Only the ILIAS webview is changed, not Uni Pilot's own. WebView2 on Windows honours attachments on its own; WebKitGTK on Linux cannot display PDFs and downloads them anyway.

Links that ask for a new window now go where a browser's new tab would (`src-tauri/src/ilias_links.rs`):

- **To ILIAS itself** (same origin), Uni Pilot asks for the link once, with the ILIAS view's own cookies. A file is saved to Downloads like any other download; a page opens in the ILIAS view.
- **To anywhere else** — `http`, `https`, `mailto` — your default browser or mail app.
- **Anything else** is refused.

How it is kept safe (`src-tauri/src/ilias_browser.rs`):

- **The file name is ours to check.** The server suggests one; Uni Pilot keeps only the last part — no folders, so nothing can land outside Downloads — replaces what file systems refuse, drops leading dots so nothing is hidden, and shortens endless names. An existing file is never overwritten: the new one becomes `Blatt 3 (1).pdf`.
- **The page never names a path.** Rust hands out an id per download and opens or shows only files it saved itself, looked up by that id. The panel only ever learns the file name.
- **Only documents and media are opened** — PDF, Office and OpenDocument files, text, images, audio, video, zip. Anything else, a program above all, is only ever shown in its folder; opening it stays your own, deliberate step.

Opening a PDF from the panel hands it to Preview (or whatever opens PDFs on your computer).

## ILIAS mode: side by side, not on top

ILIAS forbids being framed (`x-frame-options: SAMEORIGIN`), so this is not an `<iframe>`. It is a second native webview attached to the Uni Pilot window (`Window::add_child`), which Tauri keeps behind its `unstable` feature and describes as unfinished. The separate window in the panel is there in case that shows.

```text
┌──────┬──────────────┬─────────────────────────────┐
│ rail │ ILIAS panel  │                             │ ← title bar (macOS,
│      │ ‹ › ⌂        │  ILIAS, as the card         │   windowed only) and
│      │ courses…     │  (rounded on the right,     │   the frame's gutter
│      │ footer: …    │   gutter top/right/bottom)  │
└──────┴──────────────┴─────────────────────────────┘
   Uni Pilot's webview =         ILIAS's webview
   the left column, full height
```

The two webviews sit **side by side and never overlap**. A first version laid ILIAS _over_ the page instead, and that could not be made to work: macOS sends pointer movement to every webview under the pointer, covered or not, so the page underneath and ILIAS kept resetting the cursor over each other and it flickered between the hand and the arrow. Webviews that do not overlap have nothing to fight over. (A second version put Uni Pilot in a strip across the top; this one gives it a column at the left instead, which is the same layout every other section has: rail, panel, card.)

What follows from that:

- **Rust lays out the window.** Once Uni Pilot is only the left column, the page can no longer see the window, so `src-tauri/src/ilias_view.rs` places both webviews — on entering, and again on every resize and on going full screen and back. The column runs the full height of the window; ILIAS starts at the column's right edge, under the title bar and the frame's gutter, and ends a gutter short of the right and bottom edges (`arrange`, pure and tested: no overlap, never negative, the column clamped to 96 to 640 points and to the window).
- **The page says how wide the column is.** `enter_ilias_mode` takes `column` (rail plus panel, in logical pixels), `gutter` (`--frame-gutter`), `frame` (the frame's colour as `[r, g, b]`) and `page_height`; `set_ilias_layout` takes the first three again when they change while ILIAS mode is on (the theme was switched) and does nothing when it is off. The page measures rather than assuming: `column` is the right edge of the ILIAS panel (`measureColumn`), `gutter` and `frame` are read from the stylesheet (`readGutter`, `readFrameColour` in `lib/iliasFrame.ts`). Calls to Rust stay strictly ordered, so a layout update can never overtake the enter it follows.
- **The column's width must not depend on the window.** The main webview's own viewport _is_ the column, so a width taken from `vw` would feed back into the column it measures. In ILIAS mode the shell is marked `data-ilias-mode`, and `ilias.css` gives the panel a fixed 240px and the rail its 72px (which the narrow-window rule would otherwise cut to 62px, since the column is always narrower than 700px).
- **The gutter is the window's own colour.** Where no webview covers the window — above, right of and below ILIAS — the window background shows. The page sends the frame's colour (`--frame-to`, converted from hex or `oklch()` to RGB in TypeScript, no canvas) and Rust sets it as the window background (`Window::set_background_color`); the page sends it again when `data-theme` changes. Leaving ILIAS mode puts the default background back. The column's own frame is that one colour too (`ilias.css`) so the two meet without a seam. On macOS ILIAS's right-hand corners are rounded through its layer (`round_card`: `cornerRadius`, `maskedCorners` for the two corners on the far side of x, `masksToBounds`), not through the page; the left edge joins the panel and stays square.
- **The title bar is accounted for.** On macOS the window's content runs up under the title bar and the page starts below it, 28 points down when windowed and 0 in full screen. The column is placed at y = 0 like the page always is, so it keeps itself clear of the bar; ILIAS is not a page of ours and starts below the bar and the gutter, which is why the bar's height is measured, once on entering, from the gap between the window and the page (`page_height`). Without this ILIAS would sit under the title bar.
- **Linux lays out differently.** There Tauri packs all webviews of a window into one vertical GTK box and ignores the positions and sizes set on them. A box shares its height by what each child would like, and a WebKit view would like the height of its page. On Linux both webviews are therefore moved into a horizontal `GtkPaned`, whose divider stays where it is put: at the column's width, with ILIAS to its right (`stack` in `ilias_view.rs`). A paned gives all of itself to the one child still visible, so hiding ILIAS is all leaving takes. There are no gutters there.
- **Dialogs get the window back.** Uni Pilot is only the column in ILIAS mode, so a dialog would be cut off at its edge. While one is open, Uni Pilot takes the window back; afterwards ILIAS returns on the page it was on. Not for tooltips or reminders, which would make ILIAS jump out of the way on hover or mid-sentence. On macOS reminders come from a native overlay above everything; on other platforms an in-app reminder shown in ILIAS mode is cut off at the column.
- **Leaving hides ILIAS; only Disconnect closes it.** That is what keeps your place.
- **Calls to Rust go strictly in order**, each with a time limit. They are async and could overtake each other — React mounts effects twice in development — and a "leave" that landed after the student's last "enter" would show the column beside an empty window, or the other way round. The limit keeps a call that never returns from holding up every later one.

## Signing out

ILIAS 9 signs out only through the link in its own user menu. `doLogout` is one of the commands ILIAS runs only with the token that link carries (`rtoken`); a bare `logout.php` is dropped without a word, and ILIAS sends you straight back to the dashboard. That is why the button first did nothing but flicker.

**Sign out of ILIAS** now asks ILIAS for the dashboard once, finds that link in it and opens it in the ILIAS view, so ILIAS ends the session on its side (`src-tauri/src/ilias_sign_out.rs`). A few seconds later the view forgets every cookie that is not ILIAS's own, the university sign-on's among them — otherwise the next sign-in would pass straight through without a password. If ILIAS offers no sign-out link, nobody was signed in; the view then forgets ILIAS's cookies too, and the panel says so.

In a browser tab Uni Pilot cannot sign ILIAS out, so the page there has no such button and points to ILIAS's own menu instead.

## Signing in with Touch ID

The university sign-in offers **passkeys**: in Safari, Touch ID or your Mac's password sign you in. Inside Uni Pilot that option does not work, and it cannot be made to: Apple only lets a web browser, or an app on its own domains, use passkeys for a website. The login page in Uni Pilot is neither — it is `login.hs-heilbronn.de`, not Uni Pilot's domain.

What works instead:

- **Your HHN user name, password and authenticator code** in Uni Pilot, once each time Uni Pilot starts.
- **Open in your browser** (globe) in the panel, which opens the page ILIAS is on in your default browser, where Touch ID works. That signs in the browser, not Uni Pilot — the two keep their sign-ins apart.

## What is stored, and what is not

Stored, in `localStorage` under `uni-pilot.ilias`: the university's name, the ILIAS address, its client id, its release, how its login page lets people sign in, and when it was last checked.

**Not stored anywhere by Uni Pilot:** no password, no token, no session id. Your sign-in lives only in ILIAS's own cookies, the same way it would in a browser.

Three exceptions to _reading_ it, all in Rust: to fetch a link ILIAS opens in a new window, to find the sign-out link (below), and to read your courses, folders and exercises when Uni Pilot shows them (`src-tauri/src/ilias_sync/`). For each request, Rust reads the ILIAS cookies afresh. It sends them only to ILIAS's own origin — same scheme, host and port — keeps nothing, and never hands them to the page. The first two follow redirects within that origin; the sync follows only to pages that show something, never to one that changes something (`ilias_sync/links.rs`), and it never downloads a file on its own, since ILIAS records a download as reading it. A file is downloaded only when you click **Download** on the Courses page, as a click in ILIAS would; that request may go to `cmd=sendfile` and nowhere else (`may_download`).

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

- `src-tauri/src/ilias_view.rs` — ILIAS mode: entering, leaving, laying out the window on every resize, the frame colour and rounded corners, with Rust tests for the layout, the title bar and what the page may report.
- `src-tauri/src/ilias_window.rs` — the separate window, and `resolve_target`, with Rust tests.
- `src-tauri/src/ilias_sign_out.rs` — **Sign out of ILIAS**, with Rust tests for finding ILIAS's own link and for whose cookie is whose.
- `src-tauri/src/ilias_links.rs` — links ILIAS opens in a new window, and **Open in your browser**, with Rust tests for where a link goes, telling a file from a page, and file names from headers.
- `src-tauri/src/ilias_browser.rs` — back, forward and downloads for both, and which object ILIAS is showing, with Rust tests for file names, the download list and `ref_id_of`.
- `src-tauri/src/ilias_sync/` — reading courses, folders and exercises with your session: the pages it may ask for, telling signed out from empty, and readers tested against recorded HHN pages in `fixtures/`. `src/features/integrations/lib/iliasSync.ts` is its TypeScript side. Background: [`integrations/ilias-sync-research.md`](integrations/ilias-sync-research.md).
- `src/features/courses/` — the **Courses** page built on the sync: courses by study area, a course's folders, files (size, version, date) and exercises (deadline, hand-in, grade), kept in `store/courseStore.ts` so the last read survives a signed-out start. **Download** on a file saves it to Downloads through the same code as downloads in ILIAS mode, then offers **Open** (documents and media only) and **Show in folder**. `CourseSync` reads the course list every 15 minutes while Uni Pilot runs, which keeps the ILIAS sign-in alive, and stops once ILIAS says it has ended.
- `src/features/integrations/lib/iliasBrowser.ts` and `store/iliasBrowserStore.ts` — the commands and events, and what the panel shows. Listening starts once and lasts as long as the app, so a download that ends while you are elsewhere is still heard.
- `src/features/integrations/lib/ilias/endpoints.ts` — `resolveIliasTarget`, `dashboardUrl`; the TypeScript mirror of the rule.
- `src/features/integrations/lib/ilias/connection.ts` — `discoverInstallation`, which also reads the sign-in options, and `toConnection`.
- `src/features/integrations/lib/ilias/knownInstallations.ts` — Heilbronn, as configuration rather than a special case.
- `src/features/integrations/lib/iliasView.ts` — when to switch, the ordered queue, what counts as a dialog. `lib/iliasFrame.ts` — what the page reports of its layout (column, gutter, frame colour) and how it reads it, with the colour conversion.
- `src/features/integrations/lib/iliasWindow.ts` — `openIlias`, choosing between the separate window and a tab.
- `src/features/integrations/store/iliasStore.ts` — the connected installation.
- `src/features/integrations/components/` — the page, the ILIAS panel (`IliasPanel`, which also switches the shell into ILIAS mode and drives the window), and the calendar's **Open in ILIAS** button. `src/features/integrations/ilias.css` — the fixed column width and the stand-in for ILIAS.
- `src/components/layout/AppLayout.tsx`, `MainContent.tsx` and `iliasMode` and `selectPanelShown` in `src/store/uiStore.ts` — the header, the card and the face-unlock bar stepping aside while the rail and the panel stay. `iliasMode` is never persisted, so a crash in ILIAS mode cannot start the app showing only the column.

`resolve_target` in Rust and `resolveIliasTarget` in TypeScript are tested against the same cases. Change both or neither.

Run `npm run check`, then `cargo test --manifest-path src-tauri/Cargo.toml` for the Rust side. `npm run test:ilias` with `ILIAS_LIVE_BASE_URL` set checks discovery against a real installation.

## Confirmed, and still open

- ✅ **Heilbronn's sign-in works inside an embedded webview.** Confirmed on 23.09.2026 by signing in to the dashboard with a real HHN account. Heilbronn signs in through Keycloak (`login.hs-heilbronn.de`), which — unlike Google or Microsoft — does not refuse embedded browsers.
- 🔴 **ILIAS mode on every platform.** Rust computes the layout and handles the title bar, but Tauri has open issues about child webviews, and resizing the main webview goes further into its unfinished API than laying one over it did. Check it by eye after a Tauri update, on each platform you ship to — windowed, full screen, and resizing between the two. In particular, on macOS: ILIAS sits level with the panel's top and bottom, the gutter above, right of and below it is the frame's colour in every theme (and after switching theme while ILIAS is open), ILIAS's right corners are rounded and the left edge square against the panel, and the rail's traffic lights are not cut off. 🔴 The rounded corners and the window colour are untried on Windows and Linux (no rounding there; Linux has no gutters).
- 🔴 **Back, forward and downloads on Windows and Linux.** Written against each platform's webview and type-checked for Windows, but only tried on macOS. On macOS the webview does not report where a download went, so Uni Pilot chooses the path itself; check the file lands in Downloads on the others.
- 🔴 **Links ILIAS opens in a new window** are fetched once by Rust to tell a file from a page, and a page is then loaded a second time by the ILIAS view. Harmless for ILIAS's links, which only read; watch for anything that behaves differently when opened twice.
- ✅ **The sync reads the session without ILIAS mode open (macOS).** Uni Pilot's own page shares the ILIAS view's cookie store: on 25.09.2026 it saw the cookies the sign-in had set for `login.hs-heilbronn.de`. With a valid session the course list loaded, all 11 courses. 🔴 Still to confirm on Windows and Linux.
- ✅ **The ILIAS session ends when Uni Pilot quits.** After a restart no `ilias.hs-heilbronn.de` cookie was left, only the sign-on's, and signing in again took the password and the authenticator code. A sync can keep a session alive while the app runs; it cannot bring one back after a restart. While Uni Pilot runs, `CourseSync` asks ILIAS every 15 minutes and at once when the computer wakes or the student comes back to the window; if ILIAS has ended the session meanwhile, `ilias_sync/reauth.rs` tries the sign-on in a hidden window — no form, nothing typed — and only when the sign-on wants the password and code again is the student asked. 🔴 How long ILIAS and the sign-on each keep an idle session at HHN is still to be measured.
- 🔴 **Whether `tauri-plugin-http` honours `redirect: 'manual'`** in a packaged build. Discovery relies on it to tell a blocked SOAP endpoint from a redirect.
