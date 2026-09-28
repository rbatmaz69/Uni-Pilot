import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeInMail,
  listMailAccounts,
  MailFailure,
  markRead,
  openInMail,
  readInbox,
  readMessage,
  readPreviews,
  replyInMail,
  toMailFailure,
} from './appleMail';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

describe('what the page asks Rust for', () => {
  it('names accounts and messages, nothing more', async () => {
    const message = { id: 'abc@hs-heilbronn.de', mailId: 48213 };
    // A listed message goes as its Message-ID and Mail's number, not its subject.
    const listed = { ...message, subject: 'Blatt 4', sender: 'Prof', snippet: 'Guten Tag' };
    await listMailAccounts();
    await readInbox('stud.hs-heilbronn.de');
    await readPreviews('stud.hs-heilbronn.de', [listed, { id: 'x@y.de', mailId: null }]);
    await openInMail('abc@hs-heilbronn.de');
    await readMessage('stud.hs-heilbronn.de', listed);
    await markRead('stud.hs-heilbronn.de', message, true);
    await replyInMail('stud.hs-heilbronn.de', message, 'Danke!');
    await replyInMail('stud.hs-heilbronn.de', message, '   ');
    await composeInMail({
      from: 'student@stud.hs-heilbronn.de',
      to: ['prof@hs-heilbronn.de'],
      subject: 'Frage',
      body: 'Guten Tag,',
    });
    expect(invoke.mock.calls).toEqual([
      ['mail_accounts', {}],
      ['mail_inbox', { account: 'stud.hs-heilbronn.de' }],
      [
        'mail_previews',
        {
          account: 'stud.hs-heilbronn.de',
          messages: [message, { id: 'x@y.de', mailId: null }],
        },
      ],
      ['mail_open', { id: 'abc@hs-heilbronn.de' }],
      ['mail_message', { account: 'stud.hs-heilbronn.de', message }],
      ['mail_mark_read', { account: 'stud.hs-heilbronn.de', message, read: true }],
      ['mail_reply', { account: 'stud.hs-heilbronn.de', message, text: 'Danke!' }],
      ['mail_reply', { account: 'stud.hs-heilbronn.de', message, text: null }],
      [
        'mail_compose',
        {
          draft: {
            from: 'student@stud.hs-heilbronn.de',
            to: ['prof@hs-heilbronn.de'],
            subject: 'Frage',
            body: 'Guten Tag,',
          },
        },
      ],
    ]);
  });
});

describe('when Mail gives nothing', () => {
  it('turns what Rust said into a failure with a sentence', async () => {
    invoke.mockRejectedValue({ kind: 'notAllowed' });
    const failure = await readInbox('x').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MailFailure);
    expect((failure as MailFailure).kind).toBe('notAllowed');
  });

  it("keeps Rust's own words where they say more", () => {
    expect(
      toMailFailure({ kind: 'invalid', message: '"x" is not an email address.' }).message,
    ).toBe('"x" is not an email address.');
    expect(toMailFailure({ kind: 'notRunning' }).message).toBe('Apple Mail is not open.');
  });

  it('copes with a failure it does not know', () => {
    const failure = toMailFailure('command mail_inbox not found');
    expect(failure.kind).toBe('failed');
    expect(failure.message).toBe('command mail_inbox not found');
  });
});
