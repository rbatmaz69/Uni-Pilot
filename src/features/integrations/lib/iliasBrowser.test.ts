import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  goBackInIlias,
  goForwardInIlias,
  listenToIlias,
  openIliasDownload,
  openIliasInBrowser,
  readIliasHistory,
  revealIliasDownload,
  signOutOfIlias,
} from './iliasBrowser';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

type Handler = (event: { payload: unknown }) => void;
const listeners = new Map<string, Handler>();
const stopped: string[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: Handler) => {
    listeners.set(name, handler);
    return Promise.resolve(() => stopped.push(name));
  },
}));

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  listeners.clear();
  stopped.length = 0;
});

describe('history', () => {
  it('steps back and forward', async () => {
    await goBackInIlias();
    await goForwardInIlias();
    expect(invoke.mock.calls).toEqual([
      ['travel_ilias', { step: 'back' }],
      ['travel_ilias', { step: 'forward' }],
    ]);
  });

  it('reads where ILIAS stands', async () => {
    invoke.mockResolvedValue({ canGoBack: true, canGoForward: false });
    await expect(readIliasHistory()).resolves.toEqual({ canGoBack: true, canGoForward: false });
  });

  /** A missing answer means nothing to go to, not a crash in the strip. */
  it('treats no answer as nowhere to go', async () => {
    await expect(readIliasHistory()).resolves.toEqual({ canGoBack: false, canGoForward: false });
  });
});

describe('downloads', () => {
  /** The page names a download by id only; the path stays in Rust. */
  it('opens and reveals by id', async () => {
    await openIliasDownload(7);
    await revealIliasDownload(7);
    expect(invoke.mock.calls).toEqual([
      ['open_ilias_download', { id: 7 }],
      ['reveal_ilias_download', { id: 7 }],
    ]);
  });
});

describe('openIliasInBrowser', () => {
  /** Rust decides the page; the connection only says which ILIAS is home. */
  it('passes the connection, never a page address', async () => {
    await openIliasInBrowser({
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-23T10:00:00.000Z',
    });
    expect(invoke).toHaveBeenCalledWith('open_ilias_in_browser', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
  });
});

describe('signOutOfIlias', () => {
  it('asks Rust to sign out, and reports how', async () => {
    invoke.mockResolvedValue('ilias');
    const result = await signOutOfIlias({
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-23T10:00:00.000Z',
    });
    expect(result).toBe('ilias');
    expect(invoke).toHaveBeenCalledWith('sign_out_of_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
  });
});

describe('listenToIlias', () => {
  it('hands each event to its listener, and stops both', async () => {
    const onDownload = vi.fn();
    const onHistory = vi.fn();
    const stop = await listenToIlias({ onDownload, onHistory });

    const report = { id: 1, fileName: 'a.pdf', state: 'finished', openable: true };
    listeners.get('ilias-download')?.({ payload: report });
    listeners.get('ilias-history')?.({ payload: { canGoBack: true, canGoForward: false } });

    expect(onDownload).toHaveBeenCalledWith(report);
    expect(onHistory).toHaveBeenCalledWith({ canGoBack: true, canGoForward: false });

    stop();
    expect(stopped.sort()).toEqual(['ilias-download', 'ilias-history']);
  });
});
