# ILIAS sync without opening ILIAS — research

> **Status:** Research. No code changed.
> **Date:** 25.09.2026 · **Builds on:** [`ilias-integration-research.md`](ilias-integration-research.md) (issue #14) and [`../ilias-window.md`](../ilias-window.md)
> **Question:** Can Uni Pilot read a student's ILIAS at Hochschule Heilbronn on its own — new files, lecture notes, exercise sheets, announcements — so the student no longer has to open ILIAS to find out what changed?

Trust markers, as in the first report:

| Marker            | Meaning                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **verified**   | Read in the ILIAS `release_9` source (HHN runs 9.23), read in a tool's source, or observed by the team at HHN and recorded in these docs. |
| 📘 **documented** | Follows from documentation or source, but was not run.                                                                                    |
| 🟡 **community**  | How a third-party tool does it. No promise it holds at HHN.                                                                               |
| 🔴 **open**       | Needs an HHN account to measure. Section 9 lists how.                                                                                     |

**Nothing in this report was measured live against `ilias.hs-heilbronn.de`.** The environment it was
written in could not reach any ILIAS host; GitHub was reachable, so everything rests on source code.
The measurements in section 9 take about an hour with an HHN account.

---

## 1. The answer

**Yes — and without Uni Pilot ever touching the HHN password.** The first report ruled scraping
out for one decisive reason: with single sign-on, scraping meant storing the student's password
([§13](ilias-integration-research.md#13-scraping)). That is no longer true. Since then Uni Pilot
has grown an embedded ILIAS view in which the student signs in themselves, through HHN's own
Keycloak page, and Rust can already make requests with that view's cookies (`fetch_as_ilias` in
`src-tauri/src/ilias_links.rs`). A background sync is the same request, made on a schedule instead
of on a click.

What such a sync can deliver at HHN, with ILIAS 9.23 as it is:

| What the student wants to know        | Where it comes from                                                     | Cost per check |
| ------------------------------------- | ----------------------------------------------------------------------- | -------------- |
| "Something new in any of my courses?" | Dashboard news timeline — ILIAS writes an entry for every new file ✅   | 1 request      |
| New or replaced files, with versions  | Course and folder pages: type, size, date, `Version: N` per file ✅     | 1 per folder   |
| Lecturer announcements, forum posts   | Same news timeline ✅                                                   | (included)     |
| Exercise sheets and deadlines         | Exercise page for sheets and status; deadlines already come via iCal ✅ | 1 per exercise |
| The files themselves                  | Download with the same session, into a folder the student chooses       | 1 per file     |

What it cannot promise, and why:

1. **"Never sign in again" is not in our hands.** Background sync works as long as HHN's Keycloak
   still remembers the student. How long that is, is the single most important unknown (§4.2).
   After that, the student signs in once more, in Uni Pilot. Days or weeks between sign-ins
   are plausible; every day is possible.
2. **HTML is not an interface.** Each ILIAS release changes the markup: the Rust KIT downloader
   broke with ILIAS 9, and PFERD needed a release for ILIAS 10 (§3). HHN will upgrade eventually.
   Parsers need recorded fixtures and a loud failure mode, not silent empty lists.
3. **Reading is not free of side effects.** Downloading a file tells ILIAS the student read it and
   can mark it complete in the learning progress the lecturer sees (§7). The sync must be
   metadata-only by default.
4. **Submitting stays in ILIAS.** It is technically scrapeable (one tool does it, §3), but a write
   that goes wrong is a missed deadline. ILIAS mode in Uni Pilot already covers it.

**Recommendation:** build it — news-first, tree second, metadata only by default, one request at
a time — after two measurements (Keycloak session lifetime, a set of recorded HHN pages) and one
email to the HHN eLearning team (§9).

---

## 2. What changed since the first report

| First report said                                                      | Now                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scraping with OIDC means storing the password (§13).                   | The student signs in inside Uni Pilot's ILIAS view; Rust reuses that session. No password passes through Uni Pilot. ✅ (`ilias_links.rs`, `ilias_sign_out.rs`)                                                                                                           |
| Keycloak in an embedded browser: unknown.                              | Works at HHN; the sign-in survives restarting the app. ✅ ([ilias-window.md](../ilias-window.md#confirmed-and-still-open))                                                                                                                                               |
| WebDAV needs HTTP Basic, so a password; not usable at HHN (§4.7, 8.5). | **Not quite.** ILIAS 9 accepts an existing session for WebDAV — for clients it recognises by User-Agent (§5.6). And the HHN measurement used the wrong client id: `/webdav.php/hhn/`, where HHN's client is `iliashhn`. Whether WebDAV is on at HHN is still unknown. 🔴 |
| Scraping is fragile across releases.                                   | Still true, and now measured: the Rust KIT downloader stopped working with ILIAS 9. PFERD kept up and supports 9 and 10. 🟡                                                                                                                                              |

The rule from the first report stays: **no script is ever injected into ILIAS.** Nothing here
needs it. Rust makes plain HTTP requests, exactly as it already does for downloads.

---

## 3. What the community tools do

The [`ilias-downloader`](https://github.com/topics/ilias-downloader) topic lists six projects; the
wider [`ilias`](https://github.com/topics/ilias) topic adds the ones that matter most. All were
cloned and read on 25.09.2026.

| Project                                                                                       | Lang   | Licence  | Last commit | Signs in by                              | Reads                                    | Detects changes by            | ILIAS 9                    |
| --------------------------------------------------------------------------------------------- | ------ | -------- | ----------- | ---------------------------------------- | ---------------------------------------- | ----------------------------- | -------------------------- |
| [Garmelon/PFERD](https://github.com/Garmelon/PFERD)                                           | Python | MIT      | 2026-08-31  | Password: local form or Shibboleth, TOTP | HTML, ~30 element types                  | ETag, then the listing's date | ✅ and 10 (since 3.9.0)    |
| [FliegendeWurst/KIT-ILIAS-downloader](https://github.com/FliegendeWurst/KIT-ILIAS-downloader) | Rust   | GPL-3.0+ | 2026-07-28  | Password replayed into Shibboleth        | HTML (`scraper`)                         | File exists → skip            | ❌ README: broken since 9  |
| [Kagayachan/KIT-ILIAS-downloader](https://github.com/Kagayachan/KIT-ILIAS-downloader) (fork)  | Rust   | GPL-3.0+ | 2026-09-04  | As above                                 | HTML, ILIAS 9 selectors                  | File exists → skip            | ✅                         |
| [DenizAltunkapan/ilias-mcp](https://github.com/DenizAltunkapan/ilias-mcp)                     | Python | MIT      | 2026-08-30  | Password into the local login form       | HTML: **dashboard news**, calendar, tree | —                             | ✅ (Uni Stuttgart)         |
| [thetric/ilias-downloader-cli](https://github.com/thetric/ilias-downloader-cli)               | Kotlin | MIT      | 2021-03-01  | Password; WebDAV with HTTP Basic         | HTML for courses, **WebDAV** for files   | WebDAV last-modified          | ❓ ILIAS 5 era             |
| [Viperinius/ILIAS-Sync2Folder](https://github.com/Viperinius/ILIAS-Sync2Folder)               | C#     | MIT      | 2022-05-26  | Password via SOAP `login`                | SOAP `getTreeChilds`, `getFileXML`       | SOAP metadata                 | ❓ SOAP is closed at HHN   |
| [V3lop5/ilias-downloader](https://github.com/V3lop5/ilias-downloader)                         | Shell  | GPL-3.0  | 2022-10-20  | Password into the login form (curl)      | HTML via `grep`                          | **`Version: N`** property     | ❌ 5–7                     |
| [DeOldSax/iliasDownloaderTool](https://github.com/DeOldSax/iliasDownloaderTool)               | Java   | GPL-2.0  | 2021-03-03  | Password, KIT                            | HTML                                     | —                             | ❌                         |
| [cold-soda-jay/iliaD](https://github.com/cold-soda-jay/iliaD)                                 | Python | GPL-3.0  | 2023-01-25  | Password, KIT only                       | HTML                                     | —                             | ❌                         |
| [jhelgert/IliasDownloaderUniMA](https://github.com/jhelgert/IliasDownloaderUniMA)             | Python | MIT      | 2022-01-09  | Password via Mannheim CAS                | HTML                                     | "only new or updated"         | ❌                         |
| [MisterXY89/iliasScraper](https://github.com/MisterXY89/iliasScraper)                         | Python | MIT      | 2021-04-26  | Password, Konstanz                       | HTML                                     | —                             | ❌                         |
| [fluxapps/ILIAS-Pegasus](https://github.com/fluxapps/ILIAS-Pegasus)                           | TS     | GPL-3.0  | 2023-06-10  | OAuth via the REST plugin                | REST plugin + PegasusHelper plugin       | Plugin                        | ❌ needs plugins HHN lacks |

### 3.1 What the survey says

1. **Everything that still works scrapes HTML.** The SOAP tool depends on the endpoint HHN closes;
   Pegasus depends on a plugin HHN does not run (`/restplugin.php` → 404 in the first report).
2. **Every one of them takes the password and replays the login form.** That is the part Uni Pilot
   must not copy — and does not need to, because the student signs in inside Uni Pilot's own view.
3. **Staying current is the real cost.** The most-starred Rust tool died with ILIAS 9; its fork
   exists only because someone rewrote the selectors. PFERD survives because it is maintained
   every few weeks: most of its releases of the past two years carry ILIAS fixes.

### 3.2 Worth borrowing

| From            | What                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFERD           | Element types matched by URL path, query, or icon (`_fold.svg`, `_exc.svg`, `cmd=sendfile` …) — `kit_ilias_html.py`, `IliasElementType`. Robust against layout changes because icons rarely move. |
| PFERD           | The date parser for ILIAS's German and English formats, including `Heute`/`Gestern`/`Morgen` (`demangle_date`).                                                                                   |
| PFERD           | "Fetch; if the page is logged out, re-authenticate once and retry; else fail" (`_get_page`).                                                                                                      |
| PFERD           | Politeness: one task at a time, at most once a day for a full crawl, randomised start, not when lectures begin.                                                                                   |
| Kagayachan fork | ILIAS 9 selectors: `.il-std-item`, `.il-item-title a`, `div.il_ContainerListItem`, `a.il_ContainerItemTitle`, `.il_ItemProperties span.il_ItemProperty`, `#block_dash_fav_0`.                     |
| Kagayachan fork | ILIAS 9 static links, `goto.php/<type>/<ref_id>` and `goto.php/file/<ref_id>/download`; a logged-out page detected by `reloadpublic=1` or `cmd=force_login` in the final URL.                     |
| ilias-mcp       | Parsing the news timeline: `.ilNewsTimelineContentSection`, `.ilNewsTimelineEditInfo`, `.ilNewsTimelineObjHead a`; fallback `td.il-news` for the table view.                                      |
| V3lop5          | `Version: N` in the file's properties as the cheapest "this file was replaced" signal.                                                                                                            |
| KIT downloader  | A default of **8 requests per minute**, and the `scraper` crate (html5ever) for HTML in Rust.                                                                                                     |

**Licences.** Uni Pilot has no licence file yet. GPL code (the KIT downloader and its fork, V3lop5,
iliaD, DeOldSax, Pegasus) must not be copied into it. Read those for facts — which selector, which
URL — and write our own code. MIT code (PFERD, ilias-mcp, thetric) may be ported with attribution.

---

## 4. Authentication: the student's own session

### 4.1 What already exists

| Piece                            | Where                                                     | What it gives the sync                                                                                                     |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ILIAS view with Keycloak sign-in | `src-tauri/src/ilias_view.rs`                             | The student signs in once; cookies live in the webview's store and survive restarts. ✅                                    |
| Requests with the view's cookies | `fetch_as_ilias` in `src-tauri/src/ilias_links.rs`        | Cookie read per request, sent only to ILIAS's origin, redirects only within it, nothing stored. ✅                         |
| Cookie access                    | Tauri 2.11: `cookies_for_url`, `cookies`, `delete_cookie` | Read the session on every request; nothing to persist ourselves. ✅                                                        |
| Safe file saving                 | `src-tauri/src/ilias_browser.rs`                          | Name sanitising, no overwrites, open-only-documents — reusable for synced downloads. ✅                                    |
| Default data store               | No custom data directory on the ILIAS view                | A second, hidden webview should share the same cookies — needed for silent re-authentication (§4.2). 📘 check per platform |

`docs/ilias-window.md` currently promises that Rust reads the cookie "for that one request and
nothing else". A sync reads it for many requests. It still stores nothing and still never hands a
cookie to the page, but the sentence has to change with the feature — and the student should be
told, in the app, that Uni Pilot checks ILIAS in the background and how to turn it off.

### 4.2 How long a sign-in lasts — the most important unknown

There are two sessions, one behind the other:

```text
  sync request ──► ILIAS session (PHPSESSID)          idle timeout, default 30 min ✅
                     │ expired?
                     ▼
                   ILIAS starts OIDC ──► Keycloak SSO (login.hs-heilbronn.de/realms/hhn)
                                           │ still valid?  ──► yes: back to ILIAS, new session, no password
                                           └────────────────► no:  password form → the student has to act
```

1. **The ILIAS session** expires after an idle period: `client.ini` `[session] expire`, or 30 minutes
   in load-dependent mode (`ilSessionControl::DEFAULT_MAX_IDLE`). ✅ Every sync request keeps it
   alive, but overnight it will be gone.
2. **Keycloak's session** decides whether a new ILIAS session costs a password. Keycloak's defaults
   are 30 minutes idle and 10 hours maximum, longer with "remember me". 📘 HHN's values are not
   public. 🔴 That the sign-in survives restarting Uni Pilot shows the cookie is persistent, not how
   long the server honours it.
3. **ILIAS can force the password anyway.** ILIAS 9's OIDC default is `LOGIN_ENFORCE`, which sends
   `prompt=login` and makes Keycloak ask every time
   (`ilAuthProviderOpenIdConnect::doAuthentication`, `ilOpenIdConnectSettings`). ✅ At HHN that is
   evidently switched off: `ilias-window.md` records that without clearing the sign-on cookies, "the
   next sign-in would pass straight through without a password". ✅ (indirect — confirm in §9)

**Silent re-authentication, without script and without a password:** when a sync request comes
back logged out, Rust opens a **hidden** webview (same cookie store) at ILIAS's OIDC entry point,
`<base>/openidconnect.php`, and watches where it lands via the page-load hook — it never reads
the page:

- lands on the ILIAS dashboard → new session; retry the request once;
- lands on `login.hs-heilbronn.de` → Keycloak wants the password; stop, keep the last data, show
  **Sign in to ILIAS again** (one click into ILIAS mode) and a quiet notification.

A hidden view, not the visible one: the student may be in ILIAS mode at that very moment.

### 4.3 Recognising a logged-out answer

ILIAS rarely says "401". It redirects to the public repository or the login page and answers 200.
A sync that trusts status codes shows an empty course list, the same trap the first report found
with SOAP ([§6.5](ilias-integration-research.md#65-session-verhalten-von-soap--ein-fallstrick)).
Check all of:

- final URL contains `login.php`, `cmd=force_login` or `reloadpublic=1` 🟡 (fork);
- the meta bar has a login link, or `#button_shib_login` exists 🟡 (PFERD `is_logged_in`);
- the page is the public root when a course was asked for 🟡 (PFERD `_verify_page`).

**An empty result is never "nothing new" until the session has been confirmed.**

---

## 5. Where each piece of data comes from

All URLs below are relative to `https://ilias.hs-heilbronn.de`. Prefer ILIAS's own `jumpTo…`
commands to links with `cmdNode`: `cmdNode` values are generated per installation and change
between releases (ilias-mcp hard-codes them, which only works at Stuttgart).

### 5.1 "What's new": the dashboard news timeline — the cheapest signal

```text
ilias.php?baseClass=ilDashboardGUI&cmd=jumpToNews   → redirects to ilPDNewsGUI
```

- **ILIAS writes a news item for every new file (`file_created`) and every new version
  (`file_updated`)**, in the file's context, visible to course members
  (`Modules/File/classes/trait.ilObjFileNews.php`; `enableNotification()` on every new revision in
  `class.ilObjFile.php`). ✅
- Also in it: lecturer announcements, **every forum post** (`ilForum`, `NEWS_USERS`), MediaCast
  items. ✅
- **Not in it:** exercises and new folders. ✅ Exercise deadlines arrive through the iCal feed
  instead (§5.5); folders show up in the tree walk (§5.3).
- The timeline aggregates every course the student belongs to, over 7, 30 or 366 days
  (`DashboardNewsManager::getPeriodOptions`, default set by the admin). ✅
- It exists only if news is switched on globally (`block_activated_news`), and a lecturer can switch
  news off for a course. 🔴 Both need checking at HHN — hence the tree walk as a backstop.
- Each entry links its context (course, file, forum), so it maps to a course via its `ref_id`.
  Whether the DOM carries a stable news id for de-duplication is 🔴 — until confirmed, key on
  context `ref_id` + title + date.

One request answers "did anything change, and where?" for every course at once.

### 5.2 Courses

```text
ilias.php?baseClass=ilDashboardGUI&cmd=jumpToMemberships   → "Kurse und Gruppen"
ilias.php?baseClass=ilDashboardGUI&cmd=jumpToSelectedItems → favourites
```

Items are `.il-item-title a` or card titles (`.card-title a`). ✅ (`ilDashboardGUI`), 🟡 (fork).
The `ref_id` comes from the link: `goto.php/crs/<ref_id>` in ILIAS 9's static URLs, `ref_id=` in
repository links, or `…_crs_<ref_id>` in old-style `goto` links. Uni Pilot's
`resolveIliasTarget` already turns a `crs_<ref_id>` shorthand back into a link.

### 5.3 Course and folder contents, and file changes

```text
goto.php/crs/<ref_id>          ilias.php?baseClass=ilRepositoryGUI&ref_id=<ref_id>
```

Each item is a `.il-std-item` or `div.il_ContainerListItem`, with a title link and a type icon. ✅
For a **file**, ILIAS 9 prints, in `.il_ItemProperties` (`ilObjFileListGUI::getProperties`): ✅

| Property     | Example                                 | Use                                                         |
| ------------ | --------------------------------------- | ----------------------------------------------------------- |
| suffix       | `pdf`                                   | file name, icon                                             |
| size         | `1,2 MB`                                | change signal                                               |
| `Version: N` | only shown when N > 1                   | **replaced file** — the clearest signal                     |
| last update  | `18. Sep 2026, 10:12` or `Heute, 10:12` | the upload date of the _current_ version, not of the object |

So `(ref_id, version, last update, size)` detects every new or replaced file **without downloading
it** — the property that makes a metadata-only sync possible.

Things that hide items, all handled by PFERD: 🟡 a content tab that is not the default, collapsed
future sessions ("Sitzungen"), item groups, and files embedded in content pages
(`a.ilc_flist_a_FileListItemLink`).

Downloading: `goto.php/file/<ref_id>/download` 🟡 (fork), through the same path as today's
downloads. Before downloading anything, read §7.

### 5.4 Exercises

The exercise page lists its assignments (`cmdClass=ilAssignmentPresentationGUI`, `ass_id=`), each
with its deadline, instruction files and submission state; the submission tab lists what the
student handed in, with dates. 🟡 (PFERD `_find_exercise_entries*`, ilias-mcp
`list_exercise_assignments`)

Uni Pilot can show "Sheet 4 is out, due Thursday, not submitted yet". Submitting stays a click into
ILIAS mode, on that assignment (§1, point 4).

### 5.5 Calendar — already solved

The personal iCal feed works at HHN (6 events on 23.09.2026) and includes exercise deadlines and
course dates. ✅ Nothing to scrape. The news timeline and the calendar complement each other: the
timeline says what appeared, the calendar says when it is due.

### 5.6 WebDAV, revisited

If it works, WebDAV would be the best tree channel: XML instead of HTML, one `PROPFIND` per folder,
and `getlastmodified`, `getcontentlength` and an ETag for every file (`ilDAVFile`). ✅ It was
written off because it seemed to need a password. The ILIAS 9 source says otherwise:

```php
// Services/WebDAV/classes/auth/class.ilWebDAVAuthentication.php (release_9)
protected array $session_aware_webdav_clients = ["Microsoft-WebDAV-MiniRedir", "gvfs"];
…
if ($this->isUserAgentSessionAware($this->getUserAgent())) {
    if ($this->session->isAuthenticated() && $this->user->getId() !== ANONYMOUS_USER_ID) {
        return true;   // the password is never looked at
    }
}
```

A request with the student's session cookie, a User-Agent containing `gvfs`, and any
`Authorization: Basic` header (sabre/dav refuses without one, but never checks it on this path) is
authenticated by the session. ✅ (source), 🔴 (not run)

**Do not ship this without asking.** It works by claiming to be GNOME's file manager, to pass an
allow-list meant for that client. It is the student's own session reading the student's own
files, but getting past a User-Agent check by imitation is exactly what an administrator would
object to — and could block overnight. Ask the eLearning team (§9). If they agree, it replaces the
HTML tree walk for files; if not, drop it.

Two facts first: **is WebDAV on at all?** The first report's `/webdav.php/hhn/ → 200` asked for a
client that does not exist; `scripts/ilias-probe.js` asks for `/webdav.php` with no client at all,
which fails regardless. The right question is in §9.

Also note: the ETag is `sha1(size + name + object creation date)`. A replacement with the same
name and size keeps its ETag; `getlastmodified` is the better signal. ✅

### 5.7 Channels that do not help

| Channel                            | Why not                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notification centre (`notify.php`) | Only mail, chat, badges, contacts, background tasks, learning sequences — no files, no news. ✅ Opening it runs each provider's "opened" callback, where providers mark items seen.             |
| An official REST API               | Specified in the Feature Wiki ("REST API: Concepts and Basic Objects, Phase 1", OAuth2). Not in the code: ILIAS `trunk` of 24.09.2026 still has only the internal `fileStorage` REST server. ✅ |
| SOAP, private RSS feed             | Closed at HHN (first report, §8.5). ✅                                                                                                                                                          |

---

## 6. A design for Uni Pilot

### 6.1 Shape

```text
┌─────────────────────────────── Uni Pilot (Tauri) ──────────────────────────────┐
│                                                                                │
│  React: "New in ILIAS" card · course pages · notifications                     │
│        ▲ typed read models only (ExternalCourse, ExternalItem, NewsEntry)      │
│        │ events + commands                                                     │
│  Rust  src-tauri/src/ilias_sync/                                               │
│   ├─ session.rs   cookies_for_url · logged-out detection · hidden re-auth view │
│   ├─ fetch.rs     one request at a time · ≥2 s apart, jittered · backoff        │
│   ├─ parse/       news · memberships · container · exercise   (scraper crate)  │
│   └─ plan.rs      news first → changed courses → daily tree walk               │
│        │ HTTPS, same origin only, as fetch_as_ilias does today                 │
└────────┼───────────────────────────────────────────────────────────────────────┘
         ▼
   ilias.hs-heilbronn.de  (+ login.hs-heilbronn.de, only inside the hidden view)
```

**Parse in Rust, not in the page.** The raw HTML carries session-bound links and the CSRF tokens
(`rtoken`) that authorise state-changing commands. Keeping it on the Rust side matches how
downloads already work — "the strip only ever learns the file name" — and the page receives only
typed models. It costs one new crate (`scraper`, which both KIT downloaders use). Parsing in
TypeScript with `DOMParser` would fit the existing `lib/ilias/parse*.ts` pattern and cost nothing
new, but would hand full ILIAS pages to the webview. The models go into `lib/types.ts`, which was
designed provider-agnostic for exactly this.

### 6.2 The sync plan

| When                                          | What                                                                                              | Requests  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| App start, then every 60 min, jittered        | News timeline; courses mentioned since the last check → their container pages                     | 1 + a few |
| Once a day, random time, not at lecture start | Full walk: memberships → every course → every folder (skip unchanged subtrees when a date allows) | ~50–150   |
| Student presses **Refresh**                   | News + the courses on screen                                                                      | a few     |
| Student opens a file                          | Download that file                                                                                | 1         |

- New = not in the last snapshot. Uni Pilot keeps its own "seen" set; it does not rely on ILIAS's
  own markers.
- Everything runs only while Uni Pilot runs. A tray or menu-bar mode would widen that; there is no
  server, and should not be one (first report, §3.1 and §11.2).
- Errors leave the last data standing, per source, with the time of the last success — as
  `sourceStore` does for calendars.

### 6.3 Load

A student with 8 courses of about 10 folders each: the hourly check is 1–5 requests; the daily
walk about 90, spread over three to five minutes at one request every two to three seconds. That
is less than the student clicking through ILIAS by hand. Stop on `429` or `5xx`, honour
`Retry-After`, and back off exponentially. Send a User-Agent that names Uni Pilot and a contact
address, so the data centre can reach us rather than block us.

### 6.4 What is kept

| Kept                                                 | Not kept                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Course, folder and file metadata; news titles, dates | Cookies, tokens, raw HTML                                        |
| The student's own submission state                   | Forum post bodies and other students' names (first report §11.4) |
| Files the student downloaded, in their chosen folder | Anything uploaded anywhere — there is no Uni Pilot server        |

**Disconnect** deletes the snapshot, along with what it deletes today.

---

## 7. Rules the sync must follow

1. **Metadata only by default. Downloads only on request, or opt-in per course.** ILIAS records a
   read event for every file download, and when the file's learning progress mode is "content
   visited" it marks the file **completed** for the student
   (`ilObjFileGUI::sendFile` → `ilChangeEvent::_recordReadEvent`, `ilLPStatusWrapper::_updateStatus`). ✅
   A sync that mirrors a course tells the lecturer the student read everything. The opt-in has to
   say so.
2. **Never open a forum thread.** Reading a thread marks its posts as read for the student. The
   news timeline carries new posts without that. 📘
3. **GET only; never follow a link that carries `rtoken` or a state-changing `cmd`** (`delete`,
   `leave`, `confirm…`, `toggle…`). A crawler that follows every link can unsubscribe a student
   from a course. Only follow link shapes the parsers explicitly recognise.
4. **Same origin only**, redirects included, as `fetch_as_ilias` already enforces. Keycloak is
   reached only inside the hidden webview.
5. **Unrecognised page → error, not empty list** (§4.3).
6. **Course material is for the student's own study.** Synced files stay on the student's computer;
   nothing is shared, uploaded or indexed elsewhere.

---

## 8. Risks

| Risk                               | Impact | Mitigation                                                                                                                                 |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Keycloak session short             | High   | Silent re-auth first; otherwise one visible prompt, last data kept. Measure before promising "no more signing in" (§9).                    |
| HHN upgrades to ILIAS 10/11        | High   | Parsers tested against recorded HHN pages; release number recorded on connect; an unknown layout raises an error. Watch PFERD's changelog. |
| Data centre objects or rate-limits | High   | Ask first (§9); polite schedule (§6.3); identifying User-Agent; stop on `429`.                                                             |
| Learning progress falsified        | Medium | Metadata only by default; downloads opt-in, with the side effect named (§7).                                                               |
| Account action by accident         | Medium | GET-only, allow-listed link shapes (§7.3).                                                                                                 |
| News switched off for a course     | Medium | Daily tree walk as backstop.                                                                                                               |
| GPL code copied in                 | Low    | Read, then write our own (§3.2).                                                                                                           |

---

## 9. What to measure next (needs an HHN account, about an hour)

1. **Is WebDAV on?** No account needed:
   ```bash
   curl -sS -o /dev/null -D - -X PROPFIND -H 'Depth: 0' \
     https://ilias.hs-heilbronn.de/webdav.php/iliashhn/
   ```
   `401` with `WWW-Authenticate: Basic` → on. `403` with "Please enable the WebDAV plugin" → off,
   and §5.6 is moot.
2. **How long does silent re-authentication work?** Sign in in ILIAS mode, quit Uni Pilot, and
   open `https://ilias.hs-heilbronn.de/openidconnect.php` in the ILIAS view after 1 h, 12 h, 24 h,
   3 days and 7 days. Note whether it reaches the dashboard without a password. This sets the
   product promise.
3. **Record fixtures**, then scrub names, logins and matriculation numbers before committing: the
   news timeline (`cmd=jumpToNews`), memberships, a course with folders and a session, a folder with
   a file at `Version: 2` or later, an exercise with a submission. Also check whether news entries
   carry a stable id.
4. **Is news on?** Does `jumpToNews` show the timeline, or bounce? Which periods are offered?
5. **Write to the eLearning team** (elea@hs-heilbronn.de according to a search of HHN's ILIAS pages —
   confirm the address on the ILIAS legal notice first). Say what
   Uni Pilot reads, with which schedule and User-Agent, that it uses the student's own sign-in and
   stores no credentials, and ask (a) whether that is acceptable under the terms of use, (b) about
   WebDAV with a session-aware client (§5.6), and (c) whether an ILIAS 10 upgrade is planned. Their
   answer decides whether this ships to anyone beyond the team.

---

## 10. Suggested stories

| #   | Story                           | Depends on | Done when                                                                                                      |
| --- | ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Session broker in Rust          | 9.2        | Logged-out detection, hidden re-auth view, "sign in again" state; Rust tests with recorded redirect chains.    |
| 2   | Fixtures and parsers            | 9.3        | News, memberships, container and exercise parsers pass against scrubbed HHN pages; unknown layouts are errors. |
| 3   | "New in ILIAS"                  | 1, 2       | Hourly news check; a dashboard card and a notification per new file or announcement, with Open in ILIAS.       |
| 4   | Course tree and file changes    | 1, 2       | Daily walk; per-course view of files with version and date; "replaced" shown distinctly from "new".            |
| 5   | Local mirror, opt-in per course | 4          | Changed files downloaded to a chosen folder; the learning-progress side effect named in the opt-in.            |
| 6   | Exercises                       | 2          | Sheets, deadlines and submission state per course, merged with the iCal deadlines.                             |
| —   | WebDAV channel                  | 9.1, 9.5   | Only if HHN agrees.                                                                                            |

Stories 1 and 2 are the foundation. Story 3 alone already answers the question the student asked:
what is new in my courses, without opening ILIAS.

---

## 11. Sources

**ILIAS source, `release_9`** (<https://github.com/ILIAS-eLearning/ILIAS/tree/release_9>)

| Topic                           | File                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| WebDAV session authentication   | `Services/WebDAV/classes/auth/class.ilWebDAVAuthentication.php`                                             |
| WebDAV auth wiring, activation  | `Services/WebDAV/classes/class.ilWebDAVDIC.php`, `webdav.php`                                               |
| WebDAV file ETag, last-modified | `Services/WebDAV/classes/dav/class.ilDAVFile.php`                                                           |
| Basic header required           | sabre/dav 4.x `lib/DAV/Auth/Backend/AbstractBasic.php`                                                      |
| Dashboard `jumpTo…`             | `Services/Dashboard/classes/class.ilDashboardGUI.php`                                                       |
| Dashboard news                  | `Services/News/classes/class.ilPDNewsGUI.php`, `Services/News/Dashboard/class.DashboardNewsManager.php`     |
| News on file create/update      | `Modules/File/classes/trait.ilObjFileNews.php`, `Modules/File/classes/class.ilObjFile.php`                  |
| News on forum post              | `Modules/Forum/classes/class.ilForum.php`                                                                   |
| File properties in lists        | `Modules/File/classes/class.ilObjFileListGUI.php`                                                           |
| Read event and LP on download   | `Modules/File/classes/class.ilObjFileGUI.php` (`sendFile`)                                                  |
| Session idle timeout            | `Services/Authentication/classes/class.ilSession.php`, `class.ilSessionControl.php`                         |
| OIDC `prompt=login`             | `Services/OpenIdConnect/classes/class.ilAuthProviderOpenIdConnect.php`, `class.ilOpenIdConnectSettings.php` |
| Static URLs                     | `Services/PermanentLink/classes/class.ilLink.php`                                                           |
| Notification centre             | `src/GlobalScreen/Client/Notifications.php` and the `*NotificationProvider.php` classes                     |
| REST in `trunk` (24.09.2026)    | `components/ILIAS/WebServices/Rest/` — `fileStorage` only                                                   |

**Community tools:** the table in §3, each read at its default branch on 25.09.2026.
**Feature Wiki:** [REST Service](https://docu.ilias.de/goto_docu_wiki_1357_REST_Service.html),
"REST API: Concepts and Basic Objects (Phase 1)" — found by search; the page itself could not be
opened from this environment.
**HHN facts** (release 9.23, client `iliashhn`, Keycloak, iCal): the first report, §8, and
`docs/ilias-window.md`.
