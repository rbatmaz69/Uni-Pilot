import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailBody, MailMessage } from '@/features/mail/lib/appleMail';
import {
  cacheOf,
  clearMailCache,
  LIST_KEPT,
  previewsOf,
  readMailCache,
  TEXTS_KEPT,
  textsToFetch,
  writeMailCache,
} from './mailCache';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

/** `count` messages a day apart, `m0@…` the newest, listed oldest first. */
const listed = (count: number): MailMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `m${index}@hs-heilbronn.de`,
    mailId: index,
    subject: `Nachricht ${index}`,
    sender: 'Prof <prof@hs-heilbronn.de>',
    receivedAt: new Date(Date.UTC(2026, 8, 30 - index)).toISOString(),
    read: true,
    snippet: '',
    attachments: 0,
  })).reverse();

const bodyOf = (message: MailMessage): MailBody => ({
  id: message.id,
  subject: message.subject,
  sender: message.sender,
  to: [],
  cc: [],
  receivedAt: message.receivedAt,
  read: message.read,
  content: 'Guten Tag,',
  attachments: [],
});

const bodiesOf = (messages: readonly MailMessage[]) =>
  Object.fromEntries(messages.map((message) => [message.id, bodyOf(message)]));

describe('what is kept on this Mac', () => {
  it('keeps the list newest first, and the texts of the newest only', () => {
    const messages = listed(LIST_KEPT + 5);
    const cache = cacheOf('HHN', messages, bodiesOf(messages));

    expect(cache.account).toBe('HHN');
    expect(cache.messages).toHaveLength(LIST_KEPT);
    expect(cache.messages[0]?.id).toBe('m0@hs-heilbronn.de');
    expect(cache.bodies.map((body) => body.id)).toEqual(
      Array.from({ length: TEXTS_KEPT }, (_, index) => `m${index}@hs-heilbronn.de`),
    );
  });

  it('keeps only texts Mail gave', () => {
    const messages = listed(3);
    const newest = messages.find((message) => message.id === 'm0@hs-heilbronn.de')!;
    expect(cacheOf('HHN', messages, { [newest.id]: bodyOf(newest) }).bodies).toEqual([
      bodyOf(newest),
    ]);
  });

  it('fetches ahead the newest texts not there yet, newest first', () => {
    const messages = listed(TEXTS_KEPT + 10);
    const newest = messages.find((message) => message.id === 'm0@hs-heilbronn.de')!;
    const wanted = textsToFetch(messages, { [newest.id]: bodyOf(newest) });

    expect(wanted).toHaveLength(TEXTS_KEPT - 1);
    expect(wanted[0]?.id).toBe('m1@hs-heilbronn.de');
    expect(wanted.map((message) => message.id)).not.toContain(`m${TEXTS_KEPT}@hs-heilbronn.de`);
  });

  it('takes the previews a kept list carries, and asks again for the rest', () => {
    const [withText, withFile, without] = listed(3);
    const previews = previewsOf([
      { ...withText!, snippet: 'Guten Tag', attachmentNames: [] },
      { ...withFile!, attachments: 1, attachmentNames: ['Blatt4.pdf'] },
      without!,
    ]);

    expect(previews).toEqual({
      [withText!.id]: { snippet: 'Guten Tag', attachments: 0, attachmentNames: [] },
      [withFile!.id]: { snippet: '', attachments: 1, attachmentNames: ['Blatt4.pdf'] },
    });
  });
});

describe('what the page asks Rust for', () => {
  it('reads, writes and deletes the copy', async () => {
    const cache = cacheOf('HHN', listed(1), {});
    await readMailCache();
    await writeMailCache(cache);
    await clearMailCache();

    expect(invoke.mock.calls).toEqual([
      ['mail_cache_read', {}],
      ['mail_cache_write', { cache }],
      ['mail_cache_clear', {}],
    ]);
  });

  it('carries on without a copy when Rust cannot read or keep one', async () => {
    invoke.mockRejectedValue('The user denied the Keychain.');

    await expect(readMailCache()).resolves.toBeNull();
    await expect(writeMailCache(cacheOf('HHN', [], {}))).resolves.toBeUndefined();
    await expect(clearMailCache()).resolves.toBeUndefined();
  });
});
