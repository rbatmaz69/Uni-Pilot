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
// - Write drafts only. `compose` and `reply` open a window in Mail; the
//   student sends from there. No command here ever calls `send`.
//
// Every property read is an Apple Event, a round trip to Mail, and Mail
// answers them one at a time — a click on a message waits behind whatever was
// asked before it. So the script asks as little as it can:
//
// - `inbox` reads in bulk: one Apple Event per property for all the messages
//   it lists, never one per message. It finds the newest by their dates in the
//   last weeks first, and looks at the whole inbox only when those are too few.
// - Messages are found again by Mail's own id (`mailId`), which the list hands
//   out: one step, where searching by Message-ID goes through the inbox.
// - Mail keeps an Exchange message's text on the server until someone asks for
//   it, and asking fetches it. So the list never waits for text: `inbox` reads
//   only what Mail has at hand, and `previews` fetches text for a few messages
//   against a time budget, returning what it got.
//
// `handle` takes Mail as an argument so the tests can hand it a stand-in
// (src/features/mail/lib/appleMailScript.test.ts).

/** Longest text handed back for one message; a thread can quote itself forever. */
const CONTENT_MAX = 100000;
const PREVIEW_MAX = 220;
/** How long `previews` may keep Mail busy; the rest go without, for now. */
const PREVIEW_BUDGET_MS = 3000;
/**
 * How far back `inbox` looks for the newest messages, in days, before it asks
 * for the dates of the whole inbox. Most inboxes hold the newest fifty within
 * a fortnight; years of mail need not be gone through to find them.
 */
const LOOK_BACK_DAYS = [14, 90];
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How long the slow way of listing (`oneByOne`) may keep Mail busy. Rust stops
 * waiting sooner; this is for a script whose app is gone — restarted
 * mid-question — which would otherwise keep Mail busy for as long as it takes.
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

/** A property Mail may not have for this message — not yet downloaded, say. */
function safely(read, fallback) {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * The message the page means: `{ id, mailId }`. Mail's own id finds it in one
 * step, and its Message-ID confirms it is the same message. Without an id, or
 * when Mail has numbered the message anew, the Message-ID is searched for —
 * through the whole inbox, which takes Mail a while.
 */
function lookUp(box, ref) {
  if (typeof ref.mailId === 'number') {
    const candidate = box.messages.byId(ref.mailId);
    if (safely(() => candidate.messageId(), null) === ref.id) return candidate;
  }
  const found = safely(() => box.messages.whose({ messageId: ref.id })(), []);
  return found.length > 0 ? found[0] : null;
}

function findMessage(Mail, input) {
  const box = inboxOf(Mail, input.account);
  if (!box) return { error: 'noAccount' };
  const message = lookUp(box, input);
  return message ? { message } : { error: 'noMessage' };
}

function preview(message) {
  return String(safely(() => message.content(), ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PREVIEW_MAX);
}

const time = (row) => (row.receivedAt ? Date.parse(row.receivedAt) : 0);
const newestFirst = (a, b) => time(b) - time(a);

/** Messages received since `days` ago, as one element array — not yet asked. */
function receivedWithin(box, days) {
  return box.messages.whose({
    dateReceived: { _greaterThan: new Date(Date.now() - days * DAY_MS) },
  });
}

/**
 * One row per message, newest first, in one Apple Event per property. The
 * answers line up by position; Mail's ids, asked before and after, show that
 * no message came or went in between and shifted one answer against another.
 * `null` when the inbox would not hold still.
 */
function overview(messages) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mailIds = messages.id();
    const columns = [
      messages.messageId(),
      messages.subject(),
      messages.sender(),
      messages.dateReceived(),
      messages.readStatus(),
    ];
    const again = messages.id();
    const steady =
      again.length === mailIds.length &&
      again.every((mailId, index) => mailId === mailIds[index]) &&
      columns.every((column) => column.length === mailIds.length);
    if (!steady) continue;
    const [messageIds, subjects, senders, dates, reads] = columns;
    return mailIds
      .map((mailId, index) => ({
        id: messageIds[index],
        mailId,
        subject: subjects[index] ?? '',
        sender: senders[index] ?? '',
        receivedAt: dates[index] ? dates[index].toISOString() : null,
        read: reads[index] === true,
        snippet: '',
        attachments: 0,
      }))
      .filter((row) => typeof row.id === 'string' && row.id !== '')
      .sort(newestFirst);
  }
  return null;
}

/**
 * The newest `limit` messages, read in bulk. Their dates alone — of the last
 * weeks, or of the whole inbox if those are too few — give the moment the
 * newest `limit` begin; everything else is asked for just those.
 */
function newest(box, limit) {
  let dates = [];
  for (const days of LOOK_BACK_DAYS) {
    dates = receivedWithin(box, days).dateReceived();
    if (dates.length >= limit) break;
  }
  if (dates.length < limit) dates = box.messages.dateReceived();
  const times = dates
    .filter(Boolean)
    .map((date) => date.getTime())
    .sort((a, b) => b - a);
  // A second's slack below the cutoff, so no message at its edge is lost to
  // rounding; `overview` sorts, and the extra ones are cut off below.
  const chosen =
    times.length >= limit
      ? box.messages.whose({ dateReceived: { _greaterThan: new Date(times[limit - 1] - 1000) } })
      : box.messages;
  const rows = overview(chosen);
  return rows ? rows.slice(0, limit) : null;
}

/**
 * The slow way, for when Mail would not answer in bulk: the dates of every
 * message in one Apple Event, then the rest for the newest, one message and
 * one property at a time.
 */
function oneByOne(box, limit) {
  const messages = box.messages;
  const dates = messages.dateReceived();
  const at = (index) => (dates[index] ? dates[index].getTime() : 0);
  const indices = dates
    .map((_, index) => index)
    .sort((a, b) => at(b) - at(a))
    .slice(0, limit);
  const until = Date.now() + LIST_BUDGET_MS;
  const listed = [];
  for (const index of indices) {
    if (Date.now() > until) break;
    const message = messages[index];
    listed.push({
      id: message.messageId(),
      mailId: safely(() => message.id(), null),
      subject: safely(() => message.subject(), ''),
      sender: safely(() => message.sender(), ''),
      receivedAt: dates[index] ? dates[index].toISOString() : null,
      read: safely(() => message.readStatus(), false) === true,
      snippet: '',
      attachments: 0,
    });
  }
  return listed;
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
      return {
        messages: safely(() => newest(box, input.limit), null) ?? oneByOne(box, input.limit),
      };
    }

    case 'previews': {
      const box = inboxOf(Mail, input.account);
      if (!box) return { error: 'noAccount' };
      const until = Date.now() + PREVIEW_BUDGET_MS;
      const previews = {};
      for (const ref of input.messages) {
        if (Date.now() > until) break;
        const message = lookUp(box, ref);
        // A message Mail no longer has gets an empty preview: asked, answered,
        // and not asked about again.
        previews[ref.id] = message
          ? {
              snippet: preview(message),
              attachments: safely(() => message.mailAttachments.length, 0),
            }
          : { snippet: '', attachments: 0 };
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
