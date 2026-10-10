/**
 * What the ILIAS panel shows about the browser beside it: whether back and
 * forward can go anywhere, the latest downloads, and which course ILIAS is in.
 *
 * Not persisted — all of it describes this session's ILIAS webview. Listening
 * starts once and lasts as long as the app: a download keeps running when the
 * student leaves the ILIAS page, and its end must still be heard, so it cannot
 * hang on the panel being mounted.
 */

import { create } from 'zustand';
import {
  listenToIlias,
  NO_HISTORY,
  NO_LOCATION,
  readIliasHistory,
  type IliasDownload,
  type IliasHistory,
  type IliasLocation,
} from '@/features/integrations/lib/iliasBrowser';

/** Enough to see what just happened; older files are in the Downloads folder. */
const KEEP = 5;

interface IliasBrowserState {
  history: IliasHistory;
  /** The page ILIAS last finished loading. */
  location: IliasLocation;
  /** Newest first. */
  downloads: IliasDownload[];
  record: (download: IliasDownload) => void;
  setHistory: (history: IliasHistory) => void;
  setLocation: (location: IliasLocation) => void;
  dismiss: (id: number) => void;
}

export const useIliasBrowserStore = create<IliasBrowserState>((set) => ({
  history: NO_HISTORY,
  location: NO_LOCATION,
  downloads: [],
  record: (download) =>
    set(({ downloads }) => {
      const known = downloads.find((entry) => entry.id === download.id);
      // Rust sends each report from its own task, so the end can overtake
      // the start. A download that has ended never goes back to running.
      if (known && known.state !== 'started' && download.state === 'started') return {};
      const rest = downloads.filter((entry) => entry.id !== download.id);
      return { downloads: [download, ...rest].slice(0, KEEP) };
    }),
  setHistory: (history) => set({ history }),
  setLocation: (location) => set({ location }),
  dismiss: (id) => set(({ downloads }) => ({ downloads: downloads.filter((d) => d.id !== id) })),
}));

let listening: Promise<void> | null = null;

/** Starts listening to Rust, once. Safe to call on every mount. */
export function listenToIliasBrowser(): Promise<void> {
  listening ??= listenToIlias({
    onDownload: (download) => useIliasBrowserStore.getState().record(download),
    onHistory: (history) => useIliasBrowserStore.getState().setHistory(history),
    onLocation: (location) => useIliasBrowserStore.getState().setLocation(location),
  }).then(
    () => undefined,
    (cause: unknown) => {
      // Let the next mount try again rather than staying deaf for good.
      listening = null;
      throw cause;
    },
  );
  return listening;
}

/** Asks where ILIAS stands — for a panel that missed the last page load. */
export async function refreshIliasHistory(): Promise<void> {
  useIliasBrowserStore.getState().setHistory(await readIliasHistory());
}

/** For tests: forget the listener so each test starts deaf. */
export function resetIliasBrowserListening(): void {
  listening = null;
}
