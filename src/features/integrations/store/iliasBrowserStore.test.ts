import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasDownload } from '@/features/integrations/lib/iliasBrowser';
import {
  listenToIliasBrowser,
  refreshIliasHistory,
  useIliasBrowserStore,
} from './iliasBrowserStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();
const listen = vi.fn<(name: string, handler: unknown) => Promise<() => void>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: unknown) => listen(name, handler),
}));

const download = (id: number, state: IliasDownload['state']): IliasDownload => ({
  id,
  fileName: `file-${id}.pdf`,
  state,
  openable: true,
});

const downloads = () => useIliasBrowserStore.getState().downloads;
const record = (entry: IliasDownload) => useIliasBrowserStore.getState().record(entry);

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  listen.mockReset().mockResolvedValue(() => undefined);
});

describe('recording downloads', () => {
  it('puts the newest first', () => {
    record(download(1, 'finished'));
    record(download(2, 'started'));
    expect(downloads().map((entry) => entry.id)).toEqual([2, 1]);
  });

  it('updates a download in place as it ends', () => {
    record(download(1, 'started'));
    record(download(1, 'finished'));
    expect(downloads()).toEqual([download(1, 'finished')]);
  });

  /** Rust reports from separate tasks; the end can arrive before the start. */
  it('never sets an ended download running again', () => {
    record(download(1, 'finished'));
    record(download(1, 'started'));
    expect(downloads()).toEqual([download(1, 'finished')]);
  });

  it('keeps only the latest few', () => {
    for (let id = 1; id <= 8; id += 1) record(download(id, 'finished'));
    expect(downloads().map((entry) => entry.id)).toEqual([8, 7, 6, 5, 4]);
  });

  it('forgets one that was dismissed', () => {
    record(download(1, 'failed'));
    useIliasBrowserStore.getState().dismiss(1);
    expect(downloads()).toEqual([]);
  });
});

describe('listening to Rust', () => {
  /** The strip mounts on every visit; the listener must not multiply. */
  it('starts listening only once', async () => {
    await listenToIliasBrowser();
    await listenToIliasBrowser();
    expect(listen.mock.calls.map(([name]) => name)).toEqual(['ilias-download', 'ilias-history']);
  });

  it('tries again next time when listening failed', async () => {
    listen.mockRejectedValueOnce(new Error('not ready'));
    await expect(listenToIliasBrowser()).rejects.toThrowError('not ready');

    await listenToIliasBrowser();
    expect(listen).toHaveBeenCalledTimes(4);
  });

  it('reads where ILIAS stands', async () => {
    invoke.mockResolvedValue({ canGoBack: true, canGoForward: false });
    await refreshIliasHistory();
    expect(useIliasBrowserStore.getState().history).toEqual({
      canGoBack: true,
      canGoForward: false,
    });
  });
});
