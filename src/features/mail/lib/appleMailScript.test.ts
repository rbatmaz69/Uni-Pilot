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

/** JXA element arrays can be called for their items and still have a length. */
function elements<T>(items: T[]) {
  const call = () => items;
  Object.defineProperty(call, 'length', { value: items.length });
  return call;
}

function scripted(message: FakeMessage) {
  return {
    messageId: () => message.messageId,
    subject: () => message.subject,
    sender: () => message.sender,
    dateReceived: () => message.dateReceived,
    content: () => message.content,
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
      return () => message.readStatus;
    },
    set readStatus(value: boolean) {
      message.readStatus = value;
    },
  };
}

function fakeMail(accounts: FakeAccount[], running = true) {
  const outgoingMessages: Outgoing[] = [];
  const replies: { message: ReturnType<typeof scripted>; options: unknown; text: string }[] = [];
  const accountObjects = accounts.map((account) => ({
    name: () => account.name,
    emailAddresses: () => account.addresses,
    mailboxes: () => [],
  }));
  const inboxes = accounts.map((account, index) => {
    const objects = account.messages.map(scripted);
    // Called for its items, indexed like an array, asked in bulk — as in JXA.
    const messages = Object.assign(
      () => objects,
      { ...objects },
      {
        messageId: () => account.messages.map((message) => message.messageId),
        subject: () => account.messages.map((message) => message.subject),
        sender: () => account.messages.map((message) => message.sender),
        dateReceived: () => account.messages.map((message) => message.dateReceived),
        readStatus: () => account.messages.map((message) => message.readStatus),
        whose:
          ({ messageId }: { messageId: string }) =>
          () =>
            objects.filter((object) => object.messageId() === messageId),
      },
    );
    return { account: () => accountObjects[index], messages };
  });
  const mail = {
    running: () => running,
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
  return { mail, outgoingMessages, replies };
}

const newMessage = (): FakeMessage => ({
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

describe('asking Apple Mail', () => {
  it('does not start Mail on its own', () => {
    expect(ask(fakeMail([hhn()], false).mail, 'accounts')).toEqual({ error: 'notRunning' });
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
          subject: 'Blatt 4 ist online',
          sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
          receivedAt: '2026-09-25T09:12:00.000Z',
          read: false,
          snippet: '',
          attachments: 0,
        },
        {
          id: 'old@hs-heilbronn.de',
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

  it('fetches previews for the messages asked about', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'previews', {
      account: account.name,
      ids: ['new@hs-heilbronn.de', 'gone@hs-heilbronn.de'],
    });
    expect(answer).toEqual({
      previews: {
        'new@hs-heilbronn.de': {
          snippet: 'Guten Tag, Blatt 4 ist jetzt online. Viele Grüße',
          attachments: 1,
        },
      },
    });
  });

  it('stops at the limit, and listing marks nothing read', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'inbox', { account: account.name, limit: 1 });
    expect((answer.messages as unknown[]).length).toBe(1);
    expect(account.messages.map((message) => message.readStatus)).toEqual([true, false]);
  });

  it('reads the message the student opened, with its attachments', () => {
    const account = hhn();
    const answer = ask(fakeMail([account]).mail, 'message', {
      account: account.name,
      id: 'new@hs-heilbronn.de',
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

  it('marks read or unread only when asked', () => {
    const account = hhn();
    const { mail } = fakeMail([account]);
    ask(mail, 'markRead', { account: account.name, id: 'new@hs-heilbronn.de', read: true });
    expect(account.messages[1]?.readStatus).toBe(true);
    ask(mail, 'markRead', { account: account.name, id: 'new@hs-heilbronn.de', read: false });
    expect(account.messages[1]?.readStatus).toBe(false);
  });

  it('says so when the account or message is gone', () => {
    const { mail } = fakeMail([hhn()]);
    expect(
      ask(fakeMail([PRIVATE]).mail, 'inbox', { account: 'stud.hs-heilbronn.de', limit: 50 }),
    ).toEqual({
      error: 'noAccount',
    });
    expect(ask(mail, 'message', { account: 'stud.hs-heilbronn.de', id: 'gone@x.de' })).toEqual({
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
    ask(mail, 'reply', { account: account.name, id: 'new@hs-heilbronn.de', text: null });
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
