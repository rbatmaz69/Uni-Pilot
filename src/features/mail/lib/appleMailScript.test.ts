/**
 * The script Uni Pilot asks Apple Mail with (`src-tauri/src/apple_mail.js`),
 * run against a stand-in for Mail. CI has no Mail; these tests hold the
 * script to its rules instead: read what the Inbox shows, mark read only when
 * asked, and open drafts — never send.
 */

import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
// The script lives beside the Rust that runs it; there is no alias for it.
import script from '../../../../src-tauri/src/apple_mail.js?raw';

type Handle = (mail: unknown, command: string, input: unknown) => unknown;

const context: { handle?: Handle } = {};
runInNewContext(script, context);
const handle = context.handle as Handle;

/** As `run` would hand it to Rust: through JSON. */
const ask = (mail: unknown, command: string, input: unknown = {}) =>
  JSON.parse(JSON.stringify(handle(mail, command, input))) as Record<string, unknown>;

interface FakeMessage {
  /** Mail's own number for the message. */
  mailId: number;
  messageId: string;
  subject: string;
  sender: string;
  dateReceived: Date;
  readStatus: boolean;
  content: string;
  to: string[];
  attachments: { name: string; fileSize: number }[];
}

interface FakeAccount {
  name: string;
  addresses: string[];
  messages: FakeMessage[];
}

interface Outgoing {
  subject: string;
  content: string;
  visible: boolean;
  sender?: string;
  toRecipients: { address: string }[];
  send: () => never;
}

interface FakeOptions {
  running?: boolean;
  /** Whether Mail filters by date — when not, the script has to list the slow way. */
  filtersByDate?: boolean;
}

/** JXA element arrays can be called for their items and still have a length. */
function elements<T>(items: T[]) {
  const call = () => items;
  Object.defineProperty(call, 'length', { value: items.length });
  return call;
}

/**
 * Every Apple Event the script sent, in order: `message.subject` for one
 * message's subject, `every subject of 56` for the subjects of 56 messages at
 * once.
 */
type Events = string[];

function scripted(message: FakeMessage, events: Events) {
  const read =
    <T>(name: string, value: () => T) =>
    () => {
      events.push(`message.${name}`);
      return value();
    };
  return {
    id: read('id', () => message.mailId),
    messageId: read('messageId', () => message.messageId),
    subject: read('subject', () => message.subject),
    sender: read('sender', () => message.sender),
    dateReceived: read('dateReceived', () => message.dateReceived),
    content: read('content', () => message.content),
    toRecipients: () => message.to.map((address) => ({ address: () => address })),
    ccRecipients: () => [],
    mailAttachments: elements(
      message.attachments.map((attachment) => ({
        name: () => attachment.name,
        fileSize: () => attachment.fileSize,
      })),
    ),
    // Read as a call, written as a property — as JXA does it.
    get readStatus(): () => boolean {
      return read('readStatus', () => message.readStatus);
    },
    set readStatus(value: boolean) {
      message.readStatus = value;
    },
  };
}

/** `message id 42` when Mail has no message 42: every property fails (-1728). */
function missing(events: Events) {
  return {
    messageId: () => {
      events.push('message.messageId');
      throw new Error("Can't get message id 42. (-1728)");
    },
  };
}

/** `messages` of a mailbox, or of a `whose` filter on them: called for their items, indexed like an array, asked in bulk — as in JXA. */
function messageArray(list: FakeMessage[], events: Events, options: FakeOptions) {
  const objects = list.map((message) => scripted(message, events));
  const every =
    <T>(name: string, read: (message: FakeMessage) => T) =>
    () => {
      events.push(`every ${name} of ${list.length}`);
      return list.map(read);
    };
  return Object.assign(
    () => {
      events.push(`every message of ${list.length}`);
      return objects;
    },
    { ...objects },
    {
      id: every('id', (message) => message.mailId),
      messageId: every('messageId', (message) => message.messageId),
      subject: every('subject', (message) => message.subject),
      sender: every('sender', (message) => message.sender),
      dateReceived: every('dateReceived', (message) => message.dateReceived),
      readStatus: every('readStatus', (message) => message.readStatus),
      whose: (filter: { messageId?: string; dateReceived?: { _greaterThan: Date } }) => {
        if (filter.messageId !== undefined) {
          const { messageId } = filter;
          return messageArray(
            list.filter((message) => message.messageId === messageId),
            events,
            options,
          );
        }
        const after = filter.dateReceived?._greaterThan;
        if (after && options.filtersByDate !== false) {
          return messageArray(
            list.filter((message) => message.dateReceived > after),
            events,
            options,
          );
        }
        throw new Error('Mail cannot filter by that. (-1700)');
      },
      byId: (mailId: number) => {
        const found = list.find((message) => message.mailId === mailId);
        return found ? scripted(found, events) : missing(events);
      },
    },
  );
}

function fakeMail(accounts: FakeAccount[], options: FakeOptions = {}) {
  const events: Events = [];
  const outgoingMessages: Outgoing[] = [];
  const replies: { message: ReturnType<typeof scripted>; options: unknown; text: string }[] = [];
  const accountObjects = accounts.map((account) => ({
    name: () => account.name,
    emailAddresses: () => account.addresses,
    mailboxes: () => [],
  }));
  const inboxes = accounts.map((account, index) => ({
    account: () => accountObjects[index],
    messages: messageArray(account.messages, events, options),
  }));
  const mail = {
    running: () => options.running ?? true,
    accounts: () => accountObjects,
    inbox: { mailboxes: () => inboxes },
    activate: () => undefined,
    reply: (message: ReturnType<typeof scripted>, options: unknown) => {
      const draft = {
        text: `Am 25.09.2026 schrieb ${message.sender()}:\n> ${message.content()}`,
        get content(): () => string {
          return () => draft.text;
        },
        set content(value: string) {
          draft.text = value;
        },
      };
      replies.push({
        message,
        options,
        get text() {
          return draft.text;
        },
      });
      return draft;
    },
    outgoingMessages,
    OutgoingMessage: (properties: { subject: string; content: string; visible: boolean }) => ({
      ...properties,
      toRecipients: [] as { address: string }[],
      send: (): never => {
        throw new Error('The script sent a message. It must only ever open a draft.');
      },
    }),
    ToRecipient: (properties: { address: string }) => properties,
  };
  return { mail, events, outgoingMessages, replies };
}

const newMessage = (): FakeMessage => ({
  mailId: 2,
  messageId: 'new@hs-heilbronn.de',
  subject: 'Blatt 4 ist online',
  sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
  dateReceived: new Date('2026-09-25T09:12:00Z'),
  readStatus: false,
  content: 'Guten Tag,\n\n   Blatt 4   ist jetzt online.\n\nViele Grüße',
  to: ['student@stud.hs-heilbronn.de'],
  attachments: [{ name: 'Blatt4.pdf', fileSize: 81234 }],
});

const oldMessage = (): FakeMessage => ({
  mailId: 1,
  messageId: 'old@hs-heilbronn.de',
  subject: 'Willkommen',
  sender: 'Studienbüro <sb@hs-heilbronn.de>',
  dateReceived: new Date('2026-09-01T08:00:00Z'),
  readStatus: true,
  content: 'Willkommen an der HHN.',
  to: ['student@stud.hs-heilbronn.de'],
  attachments: [],
});

const hhn = (): FakeAccount => ({
  name: 'stud.hs-heilbronn.de',
  addresses: ['student@stud.hs-heilbronn.de'],
  messages: [oldMessage(), newMessage()],
});

const PRIVATE: FakeAccount = { name: 'Privat', addresses: ['me@example.org'], messages: [] };

const HOUR = 60 * 60 * 1000;

/** An inbox with a message every six hours, going back `count` of them. */
function busyAccount(count: number): FakeAccount {
  const now = Date.now();
  return {
    name: 'stud.hs-heilbronn.de',
    addresses: ['student@stud.hs-heilbronn.de'],
    // Mail keeps no order the script could rely on; the oldest come first here.
    messages: Array.from({ length: count }, (_, index) => ({
      mailId: 1000 + index,
      messageId: `m${index}@hs-heilbronn.de`,
      subject: `Nachricht ${index}`,
      sender: 'Studienbüro <sb@hs-heilbronn.de>',
      dateReceived: new Date(now - (count - index) * 6 * HOUR),
      readStatus: index % 2 === 0,
      content: `Text ${index}`,
      to: ['student@stud.hs-heilbronn.de'],
      attachments: [],
    })),
  };
}

const listedIds = (answer: Record<string, unknown>) =>
  (answer.messages as { id: string }[]).map((message) => message.id);

describe('asking Apple Mail', () => {
  it('does not start Mail on its own', () => {
    expect(ask(fakeMail([hhn()], { running: false }).mail, 'accounts')).toEqual({
      error: 'notRunning',
    });
  });

  it('lists the accounts with their addresses', () => {
    expect(ask(fakeMail([PRIVATE, hhn()]).mail, 'accounts')).toEqual({
      accounts: [
        { name: 'Privat', addresses: ['me@example.org'] },
        { name: 'stud.hs-heilbronn.de', addresses: ['student@stud.hs-heilbronn.de'] },
      ],
    });
  });

  it("reads one account's inbox, newest first, without waiting for any text", () => {
    const answer = ask(fakeMail([PRIVATE, hhn()]).mail, 'inbox', {
      account: 'stud.hs-heilbronn.de',
      limit: 50,
    });
    expect(answer).toEqual({
      messages: [
        {
          id: 'new@hs-heilbronn.de',
          mailId: 2,
          subject: 'Blatt 4 ist online',
          sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
          receivedAt: '2026-09-25T09:12:00.000Z',
          read: false,
          snippet: '',
          attachments: 0,
        },
        {
          id: 'old@hs-heilbronn.de',
          mailId: 1,
          subject: 'Willkommen',
          sender: 'Studienbüro <sb@hs-heilbronn.de>',
          receivedAt: '2026-09-01T08:00:00.000Z',
          read: true,
          snippet: '',
          attachments: 0,
        },
      ],
    });
  });

  /** Each Apple Event is a round trip, and Mail answers one at a time. */
  it('reads a busy inbox in a handful of Apple Events, none per message', () => {
    const account = busyAccount(400);
    const { mail, events } = fakeMail([account]);
    const answer = ask(mail, 'inbox', { account: account.name, limit: 50 });

    expect(listedIds(answer)).toEqual(
      Array.from({ length: 50 }, (_, index) => `m${399 - index}@hs-heilbronn.de`),
    );
    expect((answer.messages as { mailId: number }[])[0]?.mailId).toBe(1399);
    expect(events.filter((event) => event.startsWith('message.'))).toEqual([]);
    expect(events.length).toBeLessThanOrEqual(10);
    // Only about the last fortnight — never all 400.
    const sizes = events.map((event) => Number(/ of (\d+)$/.exec(event)?.[1] ?? 0));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(56);
  });

  it('looks further back when the last weeks hold too few', () => {
    const account = busyAccount(60);
    // All but ten are from long ago.
    account.messages.slice(0, 50).forEach((message, index) => {
      message.dateReceived = new Date(Date.now() - (400 - index) * 24 * HOUR);
    });
    const answer = ask(fakeMail([account]).mail, 'inbox', { account: account.name, limit: 20 });
    expect(listedIds(answer)).toEqual(
      Array.from({ length: 20 }, (_, index) => `m${59 - index}@hs-heilbronn.de`),
    );
  });

  it('lists the slow way when Mail will not filter by date', () => {
    const account = busyAccount(30);
    const { mail, events } = fakeMail([account], { filtersByDate: false });
    const answer = ask(mail, 'inbox', { account: account.name, limit: 5 });
    expect(listedIds(answer)).toEqual([
      'm29@hs-heilbronn.de',
      'm28@hs-heilbronn.de',
      'm27@hs-heilbronn.de',
      'm26@hs-heilbronn.de',
      'm25@hs-heilbronn.de',
    ]);
    expect((answer.messages as { mailId: number }[])[0]?.mailId).toBe(1029);
    expect(events).toContain('message.subject');
  });

  it('fetches previews for the messages asked about', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'previews', {
      account: account.name,
      messages: [
        { id: 'new@hs-heilbronn.de', mailId: 2 },
        { id: 'gone@hs-heilbronn.de', mailId: 9 },
      ],
    });
    expect(answer).toEqual({
      previews: {
        'new@hs-heilbronn.de': {
          snippet: 'Guten Tag, Blatt 4 ist jetzt online. Viele Grüße',
          attachments: 1,
          attachmentNames: ['Blatt4.pdf'],
        },
        // Gone from the inbox: answered, so it is not asked about again.
        'gone@hs-heilbronn.de': { snippet: '', attachments: 0, attachmentNames: [] },
      },
    });
  });

  it('stops at the limit, and listing marks nothing read', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'inbox', { account: account.name, limit: 1 });
    expect(listedIds(answer)).toEqual(['new@hs-heilbronn.de']);
    expect(account.messages.map((message) => message.readStatus)).toEqual([true, false]);
  });

  it('reads the message the student opened, with its attachments', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'message', {
      account: account.name,
      id: 'new@hs-heilbronn.de',
      mailId: 2,
    });
    expect(answer.message).toMatchObject({
      id: 'new@hs-heilbronn.de',
      to: ['student@stud.hs-heilbronn.de'],
      read: false,
      content: 'Guten Tag,\n\n   Blatt 4   ist jetzt online.\n\nViele Grüße',
      attachments: [{ name: 'Blatt4.pdf', size: 81234 }],
    });
    // Reading is not marking read.
    expect(account.messages[1]?.readStatus).toBe(false);
  });

  it("finds a message by Mail's own id, without searching the inbox", () => {
    const account = hhn();
    const { mail, events } = fakeMail([account]);
    ask(mail, 'message', { account: account.name, id: 'new@hs-heilbronn.de', mailId: 2 });
    expect(events.some((event) => event.startsWith('every message'))).toBe(false);
  });

  it('searches by Message-ID when the id is missing or names another message', () => {
    const account = hhn();
    const { mail } = fakeMail([account]);
    for (const mailId of [null, 1, 42]) {
      const answer = ask(mail, 'message', {
        account: account.name,
        id: 'new@hs-heilbronn.de',
        mailId,
      });
      expect(answer.message).toMatchObject({ id: 'new@hs-heilbronn.de' });
    }
  });

  it('marks read or unread only when asked', () => {
    const account = hhn();
    const { mail } = fakeMail([account]);
    const message = { account: account.name, id: 'new@hs-heilbronn.de', mailId: 2 };
    ask(mail, 'markRead', { ...message, read: true });
    expect(account.messages[1]?.readStatus).toBe(true);
    expect(account.messages[0]?.readStatus).toBe(true);
    ask(mail, 'markRead', { ...message, read: false });
    expect(account.messages[1]?.readStatus).toBe(false);
  });

  it('says so when the account or message is gone', () => {
    const { mail } = fakeMail([hhn()]);
    expect(
      ask(fakeMail([PRIVATE]).mail, 'inbox', { account: 'stud.hs-heilbronn.de', limit: 50 }),
    ).toEqual({
      error: 'noAccount',
    });
    expect(
      ask(mail, 'message', { account: 'stud.hs-heilbronn.de', id: 'gone@x.de', mailId: 7 }),
    ).toEqual({
      error: 'noMessage',
    });
  });
});

describe('writing through Apple Mail', () => {
  it('opens a reply window with the text above the quote, and sends nothing', () => {
    const account = hhn();
    const { mail, replies } = fakeMail([account]);
    expect(
      ask(mail, 'reply', {
        account: account.name,
        id: 'new@hs-heilbronn.de',
        mailId: 2,
        text: 'Danke, ich schaue es mir an.',
      }),
    ).toEqual({ ok: true, placed: true });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.options).toEqual({ openingWindow: true, replyToAll: false });
    expect(replies[0]?.text.startsWith('Danke, ich schaue es mir an.\n\nAm 25.09.2026')).toBe(true);
  });

  it('opens a plain reply when nothing was typed', () => {
    const account = hhn();
    const { mail, replies } = fakeMail([account]);
    ask(mail, 'reply', {
      account: account.name,
      id: 'new@hs-heilbronn.de',
      mailId: 2,
      text: null,
    });
    expect(replies[0]?.text.startsWith('Am 25.09.2026')).toBe(true);
  });

  it('opens a visible draft from the university address, and sends nothing', () => {
    const { mail, outgoingMessages } = fakeMail([hhn()]);
    const answer = ask(mail, 'compose', {
      from: 'student@stud.hs-heilbronn.de',
      to: ['prof@hs-heilbronn.de'],
      subject: 'Datenbanken 1 – Blatt 4',
      body: 'Guten Tag,',
    });
    expect(answer).toEqual({ ok: true });
    expect(outgoingMessages[0]).toMatchObject({
      subject: 'Datenbanken 1 – Blatt 4',
      content: 'Guten Tag,',
      visible: true,
      sender: 'student@stud.hs-heilbronn.de',
      toRecipients: [{ address: 'prof@hs-heilbronn.de' }],
    });
  });

  it('takes what the student typed as text, never as script', () => {
    const { mail, outgoingMessages } = fakeMail([hhn()]);
    const sly = `"); Application('Mail').outgoingMessages[0].send(); ("`;
    ask(mail, 'compose', { from: null, to: [], subject: sly, body: sly });
    expect(outgoingMessages[0]?.subject).toBe(sly);
  });
});
