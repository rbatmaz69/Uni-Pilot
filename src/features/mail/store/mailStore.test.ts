import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailMessage } from '@/features/mail/lib/appleMail';
import { useMailStore } from './mailStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const HHN = { name: 'HHN', addresses: ['s@stud.hs-heilbronn.de'] };

const LISTED: MailMessage[] = [
  {
    id: 'a@hs-heilbronn.de',
    mailId: 7,
    subject: 'Blatt 4',
    sender: 'Prof <prof@hs-heilbronn.de>',
    receivedAt: '2026-09-25T09:12:00.000Z',
    read: false,
    snippet: '',
    attachments: 0,
  },
];

/** `count` unread messages, `m0@…` the newest. */
const many = (count: number): MailMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    ...LISTED[0]!,
    id: `m${index}@hs-heilbronn.de`,
    mailId: 100 + index,
  }));

const BODY = {
  id: 'a@hs-heilbronn.de',
  subject: 'Blatt 4',
  sender: 'Prof <prof@hs-heilbronn.de>',
  to: [],
  cc: [],
  receivedAt: '2026-09-25T09:12:00.000Z',
  read: false,
  content: 'Guten Tag,',
  attachments: [],
};

/** A promise the test settles when it wants to. */
function later<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** A preview for each message asked about; `m1@…` has no text. */
const previewsFor = (args: Record<string, unknown>) =>
  Object.fromEntries(
    (args.messages as { id: string }[]).map(({ id }) => [
      id,
      { snippet: id.startsWith('m1@') ? '' : `Text of ${id}`, attachments: 0 },
    ]),
  );

function answer(
  previews: (args: Record<string, unknown>) => Promise<unknown>,
  messages: MailMessage[] = LISTED,
) {
  invoke.mockImplementation((command, args) => {
    if (command === 'mail_accounts') return Promise.resolve([HHN]);
    if (command === 'mail_inbox') return Promise.resolve(messages);
    if (command === 'mail_previews') return previews(args);
    if (command === 'mail_message') return Promise.resolve(BODY);
    return Promise.resolve(undefined);
  });
}

const calls = (command: string) => invoke.mock.calls.filter(([name]) => name === command);

beforeEach(() => {
  invoke.mockReset();
  useMailStore.setState({
    account: null,
    accounts: null,
    messages: null,
    checkedAt: null,
    loading: false,
    failure: null,
    previews: {},
    selectedId: null,
    bodies: {},
    bodyLoading: null,
    bodyFailure: null,
  });
});

describe('the mail store', () => {
  /** The list is up before any text is fetched; previews follow. */
  it('shows the list first and fills in previews after', async () => {
    let deliver: (value: unknown) => void = () => undefined;
    answer(() => new Promise((resolve) => (deliver = resolve)));
    await useMailStore.getState().refresh('hs-heilbronn.de');

    expect(useMailStore.getState().messages?.[0]?.snippet).toBe('');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('mail_previews', {
        account: 'HHN',
        messages: [{ id: 'a@hs-heilbronn.de', mailId: 7 }],
      }),
    );

    deliver({ 'a@hs-heilbronn.de': { snippet: 'Guten Tag,', attachments: 2 } });
    await vi.waitFor(() =>
      expect(useMailStore.getState().messages?.[0]).toMatchObject({
        snippet: 'Guten Tag,',
        attachments: 2,
      }),
    );
  });

  it('keeps the list when previews do not come', async () => {
    answer(() => vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'failed' })());
    await useMailStore.getState().refresh('hs-heilbronn.de');
    await useMailStore.getState().loadPreviews();

    expect(useMailStore.getState().messages).toHaveLength(1);
    expect(useMailStore.getState().failure).toBeNull();
  });

  it('says so when Mail takes too long for the list', async () => {
    invoke.mockImplementation((command) =>
      command === 'mail_accounts'
        ? Promise.resolve([HHN])
        : vi.fn<() => Promise<unknown>>().mockRejectedValue({
            kind: 'failed',
            message: 'Apple Mail did not answer within 45 seconds.',
          })(),
    );
    await useMailStore.getState().refresh('hs-heilbronn.de');

    expect(useMailStore.getState().failure?.message).toBe(
      'Apple Mail did not answer within 45 seconds.',
    );
    expect(useMailStore.getState().loading).toBe(false);
  });

  it("asks for Mail's accounts once a session, not with every refresh", async () => {
    answer(() => Promise.resolve({}));
    await useMailStore.getState().refresh('hs-heilbronn.de');
    await useMailStore.getState().refresh('hs-heilbronn.de');

    expect(calls('mail_accounts')).toHaveLength(1);
    expect(calls('mail_inbox')).toHaveLength(2);
  });

  it('asks for the accounts again when the chosen one is gone from Mail', async () => {
    useMailStore.setState({ account: 'Old', accounts: [{ name: 'Old', addresses: [] }] });
    answer(() => Promise.resolve({}));
    const listed = invoke.getMockImplementation()!;
    // Rust refuses with `{ kind }`, not an Error.
    const gone = vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'noAccount' });
    invoke.mockImplementation((command, args) =>
      command === 'mail_inbox' && args.account === 'Old' ? gone() : listed(command, args),
    );
    await useMailStore.getState().refresh('stud.hs-heilbronn.de');

    const state = useMailStore.getState();
    expect(state.account).toBe('HHN');
    expect(state.messages).toHaveLength(1);
    expect(state.failure).toBeNull();
  });

  /** Each preview has Mail fetch a text; a click on a message waits behind them. */
  it('fetches previews a few at a time, and each only once', async () => {
    answer((args) => Promise.resolve(previewsFor(args)), many(12));
    await useMailStore.getState().refresh('hs-heilbronn.de');
    await vi.waitFor(() =>
      expect(
        useMailStore.getState().messages?.every((m) => m.id.startsWith('m1@') || m.snippet),
      ).toBe(true),
    );

    expect(calls('mail_previews').map(([, args]) => (args.messages as unknown[]).length)).toEqual([
      5, 5, 2,
    ]);
    // Asked again, the list keeps its previews — the empty one too.
    await useMailStore.getState().refresh('hs-heilbronn.de');
    await useMailStore.getState().loadPreviews();
    expect(calls('mail_previews')).toHaveLength(3);
    expect(useMailStore.getState().messages?.[0]?.snippet).toBe('Text of m0@hs-heilbronn.de');
  });

  it('lets a message the student opens go before the next previews', async () => {
    const chunk = later<unknown>();
    const text = later<unknown>();
    answer(() => chunk.promise, many(10));
    await useMailStore.getState().refresh('hs-heilbronn.de');
    invoke.mockImplementation((command, args) => {
      if (command === 'mail_message') return text.promise;
      if (command === 'mail_previews') return Promise.resolve(previewsFor(args));
      return Promise.resolve(undefined);
    });

    const opened = useMailStore.getState().select('m7@hs-heilbronn.de');
    chunk.resolve(previewsFor({ messages: many(5) }));
    await vi.waitFor(() => expect(useMailStore.getState().messages?.[0]?.snippet).not.toBe(''));
    // The message is still on its way; the next previews wait for it.
    expect(calls('mail_previews')).toHaveLength(1);

    text.resolve({ ...BODY, id: 'm7@hs-heilbronn.de' });
    await opened;
    await vi.waitFor(() => expect(calls('mail_previews')).toHaveLength(2));
    expect(calls('mail_message')[0]?.[1]).toEqual({
      account: 'HHN',
      message: { id: 'm7@hs-heilbronn.de', mailId: 107 },
    });
  });

  it('asks Mail for a message once, however often it is clicked', async () => {
    answer(() => Promise.resolve({}), many(2));
    await useMailStore.getState().refresh('hs-heilbronn.de');
    const text = later<unknown>();
    const { select } = useMailStore.getState();
    invoke.mockImplementation((command) =>
      command === 'mail_message' ? text.promise : Promise.resolve(undefined),
    );

    // Opened, left before it came, opened again.
    const first = select('m0@hs-heilbronn.de');
    const other = select('m1@hs-heilbronn.de');
    const again = select('m0@hs-heilbronn.de');
    expect(useMailStore.getState().bodyLoading).toBe('m0@hs-heilbronn.de');
    text.resolve({ ...BODY, id: 'm0@hs-heilbronn.de' });
    await Promise.all([first, other, again]);
    await select('m0@hs-heilbronn.de');

    const asked = calls('mail_message').map(([, args]) => (args.message as { id: string }).id);
    expect(asked).toEqual(['m0@hs-heilbronn.de', 'm1@hs-heilbronn.de']);
    const marked = calls('mail_mark_read').map(([, args]) => (args.message as { id: string }).id);
    expect(marked.filter((id) => id === 'm0@hs-heilbronn.de')).toHaveLength(1);
    expect(useMailStore.getState().bodyLoading).toBeNull();
  });

  it('marks a message read at once, and takes it back when Mail refuses', async () => {
    answer(() => Promise.resolve({}));
    await useMailStore.getState().refresh('hs-heilbronn.de');
    const refusal = later<unknown>();
    invoke.mockImplementation((command) =>
      command === 'mail_mark_read' ? refusal.promise : Promise.resolve(undefined),
    );

    const marking = useMailStore.getState().setRead('a@hs-heilbronn.de', true);
    expect(useMailStore.getState().messages?.[0]?.read).toBe(true);
    await vi.waitFor(() => expect(calls('mail_mark_read')).toHaveLength(1));
    expect(calls('mail_mark_read')[0]?.[1]).toEqual({
      account: 'HHN',
      message: { id: 'a@hs-heilbronn.de', mailId: 7 },
      read: true,
    });

    refusal.reject({ kind: 'noMessage' });
    await marking;
    expect(useMailStore.getState().messages?.[0]?.read).toBe(false);
    expect(useMailStore.getState().bodyFailure?.kind).toBe('noMessage');
  });
});
