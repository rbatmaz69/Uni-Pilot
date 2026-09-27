/* global Application */
// What Uni Pilot asks Apple Mail, through `osascript -l JavaScript` (JXA).
//
// Rust runs this file with two arguments: a command and its input as JSON.
// Input never becomes part of the script text, so a subject with quotes in it
// stays a subject. The answer is JSON on stdout.
//
// The rules every command keeps:
//
// - Read what the Inbox shows, nothing more: the overview of the newest
//   messages, a one-line preview for some of them, and the whole text of the
//   one message the student opened. Listing marks nothing read; only
//   `markRead` does, and only when the student opened or asked.
//
// Mail keeps an Exchange message's text on the server until someone asks for
// it, and asking fetches it. So the list never waits for text: `inbox` reads
// only what Mail has at hand, and `previews` fetches text for a few messages
// against a time budget, returning what it got.
// - Write drafts only. `compose` and `reply` open a window in Mail; the
//   student sends from there. No command here ever calls `send`.
//
// `handle` takes Mail as an argument so the tests can hand it a stand-in
// (src/features/mail/lib/appleMailScript.test.ts).

/** Longest text handed back for one message; a thread can quote itself forever. */
const CONTENT_MAX = 100000;
const PREVIEW_MAX = 220;
/** How long `previews` may keep Mail busy; the rest go without. */
const PREVIEW_BUDGET_MS = 6000;
/**
 * How long `inbox` may keep Mail busy. Rust stops waiting sooner; this is for
 * a script whose app is gone — restarted mid-question — which would otherwise
 * keep Mail busy for as long as it takes.
 */
const LIST_BUDGET_MS = 30000;

/** The account's own inbox. Found through Mail's shared In box rather than by
 * name: an Exchange inbox may be called "Inbox", "INBOX" or "Posteingang". */
function inboxOf(Mail, accountName) {
  const shared = Mail.inbox.mailboxes().find((box) => box.account().name() === accountName);
  if (shared) return shared;
  const account = Mail.accounts().find((candidate) => candidate.name() === accountName);
  if (!account) return null;
  return (
    account
      .mailboxes()
      .find((box) => ['inbox', 'posteingang'].includes(box.name().toLowerCase())) ?? null
  );
}

function findMessage(Mail, input) {
  const box = inboxOf(Mail, input.account);
  if (!box) return { error: 'noAccount' };
  const found = box.messages.whose({ messageId: input.id })();
  return found.length > 0 ? { message: found[0] } : { error: 'noMessage' };
}

/** A property Mail may not have for this message — not yet downloaded, say. */
function safely(read, fallback) {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function preview(message) {
  return String(safely(() => message.content(), ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PREVIEW_MAX);
}

function handle(Mail, command, input) {
  // Asking Mail anything would start it. Uni Pilot does not start Mail on its
  // own; the page offers to.
  if (!Mail.running()) return { error: 'notRunning' };

  switch (command) {
    case 'accounts':
      return {
        accounts: Mail.accounts().map((account) => ({
          name: account.name(),
          addresses: account.emailAddresses(),
        })),
      };

    case 'inbox': {
      const box = inboxOf(Mail, input.account);
      if (!box) return { error: 'noAccount' };
      // Dates for all messages in one Apple Event, to find the newest; the
      // rest only for those, one message at a time.
      const messages = box.messages;
      const dates = messages.dateReceived();
      const time = (index) => (dates[index] ? dates[index].getTime() : 0);
      const newest = dates
        .map((_, index) => index)
        .sort((a, b) => time(b) - time(a))
        .slice(0, input.limit);
      const until = Date.now() + LIST_BUDGET_MS;
      const listed = [];
      for (const index of newest) {
        if (Date.now() > until) break;
        const message = messages[index];
        listed.push({
          id: message.messageId(),
          subject: safely(() => message.subject(), ''),
          sender: safely(() => message.sender(), ''),
          receivedAt: dates[index] ? dates[index].toISOString() : null,
          read: safely(() => message.readStatus(), false) === true,
          snippet: '',
          attachments: 0,
        });
      }
      return { messages: listed };
    }

    case 'previews': {
      const box = inboxOf(Mail, input.account);
      if (!box) return { error: 'noAccount' };
      const until = Date.now() + PREVIEW_BUDGET_MS;
      const previews = {};
      for (const id of input.ids) {
        if (Date.now() > until) break;
        const found = safely(() => box.messages.whose({ messageId: id })(), []);
        if (found.length === 0) continue;
        previews[id] = {
          snippet: preview(found[0]),
          attachments: safely(() => found[0].mailAttachments.length, 0),
        };
      }
      return { previews };
    }

    case 'message': {
      const found = findMessage(Mail, input);
      if (!found.message) return found;
      const message = found.message;
      const received = safely(() => message.dateReceived(), null);
      return {
        message: {
          id: message.messageId(),
          subject: safely(() => message.subject(), ''),
          sender: safely(() => message.sender(), ''),
          to: safely(() => message.toRecipients().map((r) => r.address()), []),
          cc: safely(() => message.ccRecipients().map((r) => r.address()), []),
          receivedAt: received ? received.toISOString() : null,
          read: safely(() => message.readStatus(), false) === true,
          content: String(safely(() => message.content(), '')).slice(0, CONTENT_MAX),
          attachments: safely(
            () =>
              message.mailAttachments().map((attachment) => ({
                name: safely(() => attachment.name(), 'Attachment'),
                size: safely(() => attachment.fileSize(), null),
              })),
            [],
          ),
        },
      };
    }

    case 'markRead': {
      const found = findMessage(Mail, input);
      if (!found.message) return found;
      found.message.readStatus = input.read === true;
      return { ok: true };
    }

    case 'reply': {
      const found = findMessage(Mail, input);
      if (!found.message) return found;
      const draft = Mail.reply(found.message, { openingWindow: true, replyToAll: false });
      // The student's text above the quote. Mail may keep the window as it
      // opened it; the page has put the text on the clipboard as well.
      const placed =
        !input.text ||
        safely(() => {
          draft.content = `${input.text}\n\n${draft.content()}`;
          return true;
        }, false);
      Mail.activate();
      return { ok: true, placed };
    }

    case 'compose': {
      const message = Mail.OutgoingMessage({
        subject: input.subject,
        content: input.body,
        visible: true,
      });
      Mail.outgoingMessages.push(message);
      if (input.from) message.sender = input.from;
      for (const address of input.to) {
        message.toRecipients.push(Mail.ToRecipient({ address }));
      }
      Mail.activate();
      return { ok: true };
    }

    default:
      return { error: 'unknownCommand' };
  }
}

// osascript calls this with the arguments after the script.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function run(argv) {
  const [command = '', input = '{}'] = argv;
  return JSON.stringify(handle(Application('Mail'), command, JSON.parse(input)));
}
