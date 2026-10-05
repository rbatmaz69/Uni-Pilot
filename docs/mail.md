# University mail in Uni Pilot

Open **Inbox** in the sidebar. On a Mac with the university account set up in Apple Mail, Uni Pilot shows that inbox: sorted by who wrote and which course it is about, readable in place, answered in Mail. New messages can be sent from Uni Pilot itself, through Mail.

## How it works

HHN student mail is Microsoft 365 (Exchange Online), and its sign-in goes through the university's own login with an authenticator code. Exchange Online takes no password from an app — only OAuth, with an app registration the university may have to approve. Apple Mail already has one, and the student has signed in there. So Uni Pilot asks **Apple Mail**, on this Mac, and never talks to Microsoft:

```text
Microsoft 365 ⇄ Apple Mail (signed in, has the mail) ⇄ Apple Events, this Mac only ⇄ Uni Pilot (Rust) → the Inbox page
```

- `src-tauri/src/apple_mail.js` is what Mail is asked, through `osascript -l JavaScript`. Input travels as a JSON argument, never as script text.
- `src-tauri/src/apple_mail.rs` runs it, checks what goes in and reads what comes out.
- `src-tauri/src/mail_cache.rs` keeps the newest mail on this Mac, encrypted (see below).
- `src/features/mail/` is the page: `lib/mail.ts` sorts (university, fellow students, ILIAS, other; the course a message is about, from ILIAS's course list), `lib/mailCache.ts` decides what is kept, `store/mailStore.ts` keeps the state, `components/` draws list, board and reading pane.

### Keeping Mail quick

Every property the script reads is an Apple Event — a round trip to Mail — and Mail answers them one at a time: a click on a message waits behind whatever was asked before it. So Uni Pilot asks as little as it can:

- **The list is read in bulk.** Mail filters the inbox by date (the last 14 days, then 90, then all of it only if those hold too few), and each property — subject, sender, date, read — comes for all listed messages in one Apple Event. About ten Apple Events for the list, however big the inbox; before, it was four per message. If Mail will not filter or answer in bulk, the script falls back to reading one message at a time.
- **Messages are found by Mail's own id.** The list carries each message's `mailId`; opening, previewing, marking read and replying look the message up by it in one step and check its Message-ID. Only when that fails is the inbox searched by Message-ID.
- **Mail is asked again only when the list is over a minute old** — on opening the Inbox as on coming back to the window. Mail's accounts are asked for once a session.
- **Previews, including up to three attachment file names, come five at a time** and wait while a message is being opened; each message is asked about once a session, also when it has no text.
- **A message's text is fetched once.** Clicking it again while it loads waits for the same answer; clicking it later shows it at once.
- **The newest texts are fetched ahead.** After the previews, the texts of the newest 25 messages are fetched one at a time, so clicking one opens it at once. Fetching ahead marks nothing read, and waits whenever the student opens or sends a message.
- **Sending goes first.** While a message is on its way to Mail, previews and texts fetched ahead wait.
- **The last list is shown at start.** The list and the newest texts are kept on this Mac (below); the Inbox shows them at once and asks Mail for what is new behind them.

The first time, macOS asks whether Uni Pilot may control Mail (System Settings → Privacy & Security → Automation). In `npm run tauri:dev` the question names **Terminal**, which started the app; in an installed build it names Uni Pilot, with the reason from `src-tauri/Info.plist`.

## The rules

- **Read what the Inbox shows, nothing more.** The newest 50 messages with a one-line preview and up to three attachment names each, and the full text of the newest 25 and of any message the student opens. Nothing is passed on. Kept on disk: the chosen account, list or board, the triage (Needs reply / Waiting / Done) by Message-ID, and the copy below.
- **The newest mail is kept on this Mac, encrypted.** The list of the newest 50 (with previews) and the text of the newest 25 — about a week of university mail — in one file in Uni Pilot's data folder, encrypted with AES-256-GCM. The key is in the Keychain: Mail's own folder (`~/Library/Mail`) is shielded from other apps by macOS, Uni Pilot's is not, so the file is of no use without the key. macOS asks once whether Uni Pilot may use the key, and again after an update (an ad-hoc signed build is a new app to the Keychain); refused, nothing is kept. Rust holds the copy to these limits whatever the page sends. It is deleted after 30 days without the Inbox, when the student switches account, and when **Settings → Keep the newest mail on this Mac** is turned off — which also stops fetching texts ahead.
- **Listing marks nothing read.** Opening a message in the pane marks it read in Mail, as Mail would; **Mark as unread** undoes it.
- **Uni Pilot sends only what the student confirmed.** New message and "Email about this" on a course's assignment offer two ways: **Open draft in Mail**, to finish and send it there, or **Send…**, which asks once more — who gets it, from which address — before **Send now** has Mail send it. Mail signs in for it, as it does for reading; Uni Pilot still never talks to Microsoft.
  - Sending needs the university address as sender and at least one recipient; Rust refuses a message without either, so it never goes out from Mail's default (perhaps private) account.
  - A reply always opens as a draft in Mail: Mail may not take the typed text into its reply window, and a reply without it should not go out.
  - Offline, Mail keeps the message in its Outbox and sends it later. If Mail does not take it at all, it opens as a draft instead. If Mail stops answering mid-send, the page says the message may have gone out, and to look in Sent before sending again.
  - Only the script's `send` command calls Mail's `send`; `appleMailScript.test.ts` fails if any other command does.
- **Links in a message are not links.** The text is shown as text; a link followed inside Uni Pilot's window would navigate the app itself away. Open the message in Mail to follow one.
- **Mail is not started unasked.** If it is closed, the page offers to open it.

## Limits

- Mac only. Windows and Linux answer `unsupported`; reaching Microsoft 365 there needs Uni Pilot's own app registration (Microsoft Graph), which is not built.
- Attachments are listed, not saved: **Open in Mail** to save one.
- Mail's `reply` may keep its window as it opened it; the typed reply is also put on the clipboard.

## Setting up the account on a Mac

In Mail: **Settings → Accounts → + → Microsoft Exchange**, the university address, **Sign In**. If macOS asks to choose a certificate, choose none (Cancel) — HHN does not sign in by certificate, and the prompt otherwise waits unseen behind a blank sign-in window.
