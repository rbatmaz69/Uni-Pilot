# University mail in Uni Pilot

Open **Inbox** in the sidebar. On a Mac with the university account set up in Apple Mail, Uni Pilot shows that inbox: sorted by who wrote and which course it is about, readable in place, answered in Mail.

## How it works

HHN student mail is Microsoft 365 (Exchange Online), and its sign-in goes through the university's own login with an authenticator code. Exchange Online takes no password from an app — only OAuth, with an app registration the university may have to approve. Apple Mail already has one, and the student has signed in there. So Uni Pilot asks **Apple Mail**, on this Mac, and never talks to Microsoft:

```text
Microsoft 365 ⇄ Apple Mail (signed in, has the mail) ⇄ Apple Events, this Mac only ⇄ Uni Pilot (Rust) → the Inbox page
```

- `src-tauri/src/apple_mail.js` is what Mail is asked, through `osascript -l JavaScript`. Input travels as a JSON argument, never as script text.
- `src-tauri/src/apple_mail.rs` runs it, checks what goes in and reads what comes out.
- `src/features/mail/` is the page: `lib/mail.ts` sorts (university, fellow students, ILIAS, other; the course a message is about, from ILIAS's course list), `store/mailStore.ts` keeps the state, `components/` draws list, board and reading pane.

### Keeping Mail quick

Every property the script reads is an Apple Event — a round trip to Mail — and Mail answers them one at a time: a click on a message waits behind whatever was asked before it. So Uni Pilot asks as little as it can:

- **The list is read in bulk.** Mail filters the inbox by date (the last 14 days, then 90, then all of it only if those hold too few), and each property — subject, sender, date, read — comes for all listed messages in one Apple Event. About ten Apple Events for the list, however big the inbox; before, it was four per message. If Mail will not filter or answer in bulk, the script falls back to reading one message at a time.
- **Messages are found by Mail's own id.** The list carries each message's `mailId`; opening, previewing, marking read and replying look the message up by it in one step and check its Message-ID. Only when that fails is the inbox searched by Message-ID.
- **Mail is asked again only when the list is over a minute old** — on opening the Inbox as on coming back to the window. Mail's accounts are asked for once a session.
- **Previews come five at a time** and wait while a message is being opened; each message is asked about once a session, also when it has no text.
- **A message's text is fetched once.** Clicking it again while it loads waits for the same answer; clicking it later shows it at once.

The first time, macOS asks whether Uni Pilot may control Mail (System Settings → Privacy & Security → Automation). In `npm run tauri:dev` the question names **Terminal**, which started the app; in an installed build it names Uni Pilot, with the reason from `src-tauri/Info.plist`.

## The rules

- **Read what the Inbox shows, nothing more.** The newest 50 messages with a one-line preview, and the full text of the message the student opens. On this Mac, in memory only — no message is stored or passed on. Kept on disk: the chosen account, list or board, and the triage (Needs reply / Waiting / Done) by Message-ID.
- **Listing marks nothing read.** Opening a message in the pane marks it read in Mail, as Mail would; **Mark as unread** undoes it.
- **Uni Pilot never sends.** Reply, New message and "Email about this" on a course's assignment open a draft in Mail. The student reads it there and presses Send there. The script has no send; `appleMailScript.test.ts` fails if it ever calls one.
- **Links in a message are not links.** The text is shown as text; a link followed inside Uni Pilot's window would navigate the app itself away. Open the message in Mail to follow one.
- **Mail is not started unasked.** If it is closed, the page offers to open it.

## Limits

- Mac only. Windows and Linux answer `unsupported`; reaching Microsoft 365 there needs Uni Pilot's own app registration (Microsoft Graph), which is not built.
- Attachments are listed, not saved: **Open in Mail** to save one.
- Mail's `reply` may keep its window as it opened it; the typed reply is also put on the clipboard.

## Setting up the account on a Mac

In Mail: **Settings → Accounts → + → Microsoft Exchange**, the university address, **Sign In**. If macOS asks to choose a certificate, choose none (Cancel) — HHN does not sign in by certificate, and the prompt otherwise waits unseen behind a blank sign-in window.
