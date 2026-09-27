import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMailStore } from './mailStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const LISTED = [
  {
    id: 'a@hs-heilbronn.de',
    subject: 'Blatt 4',
    sender: 'Prof <prof@hs-heilbronn.de>',
    receivedAt: '2026-09-25T09:12:00.000Z',
    read: false,
    snippet: '',
    attachments: 0,
  },
];

function answer(previews: () => Promise<unknown>) {
  invoke.mockImplementation((command) => {
    if (command === 'mail_accounts') {
      return Promise.resolve([{ name: 'HHN', addresses: ['s@stud.hs-heilbronn.de'] }]);
    }
    if (command === 'mail_inbox') return Promise.resolve(LISTED);
    if (command === 'mail_previews') return previews();
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  invoke.mockReset();
  useMailStore.setState({
    account: null,
    accounts: null,
    messages: null,
    checkedAt: null,
    loading: false,
    failure: null,
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
        ids: ['a@hs-heilbronn.de'],
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
        ? Promise.resolve([{ name: 'HHN', addresses: ['s@stud.hs-heilbronn.de'] }])
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
});
