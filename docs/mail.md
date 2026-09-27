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
