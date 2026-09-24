/**
 * The browser parts of ILIAS mode — the TypeScript side of
 * `src-tauri/src/ilias_browser.rs`: back and forward, and downloads.
 *
 * Rust does the work natively and reports back with two events. Nothing here
 * touches the ILIAS page itself; it only asks Rust and listens.
 *
 * Downloads are named by the id Rust handed out, never by a path — the page
 * cannot ask Rust to open an arbitrary file, only one Rust saved itself.
 */

import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';

export type IliasDownloadState = 'started' | 'finished' | 'failed';

export interface IliasDownload {
  id: number;
  /** The name it was saved under in Downloads — possibly numbered, `Blatt (1).pdf`. */
  fileName: string;
  state: IliasDownloadState;
  /** Whether Rust will open it with its default app — documents and media only. */
  openable: boolean;
}

export interface IliasHistory {
  canGoBack: boolean;
  canGoForward: boolean;
}

export const NO_HISTORY: IliasHistory = { canGoBack: false, canGoForward: false };

async function call<T = void>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Goes back a page in ILIAS, like a browser's back button. */
export function goBackInIlias(): Promise<void> {
  return call('travel_ilias', { step: 'back' });
}

/** Goes forward a page in ILIAS. */
export function goForwardInIlias(): Promise<void> {
  return call('travel_ilias', { step: 'forward' });
}

/** Where ILIAS stands now; nothing to go back to while it is not open. */
export async function readIliasHistory(): Promise<IliasHistory> {
  const history = await call<Partial<IliasHistory> | null | undefined>('ilias_history');
  return {
    canGoBack: history?.canGoBack === true,
    canGoForward: history?.canGoForward === true,
  };
}

/** Opens a finished download with its default app. */
export function openIliasDownload(id: number): Promise<void> {
  return call('open_ilias_download', { id });
}

/** Shows a finished download in its folder. */
export function revealIliasDownload(id: number): Promise<void> {
  return call('reveal_ilias_download', { id });
}

/**
 * Opens the page ILIAS is on in the default browser — the dashboard when ILIAS
 * is elsewhere, at the sign-in say. For passkeys: Touch ID and the Mac's
 * password work at the university sign-in in a browser, but Apple keeps them
 * from an app's webview.
 */
export function openIliasInBrowser(connection: IliasConnection): Promise<void> {
  return call('open_ilias_in_browser', {
    baseUrl: connection.baseUrl,
    clientId: connection.clientId,
  });
}

export interface IliasBrowserListeners {
  onDownload: (download: IliasDownload) => void;
  onHistory: (history: IliasHistory) => void;
}

/** Listens to what Rust reports. Resolves to a function that stops listening. */
export async function listenToIlias(listeners: IliasBrowserListeners): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const stops = await Promise.all([
    listen<IliasDownload>('ilias-download', (event) => listeners.onDownload(event.payload)),
    listen<IliasHistory>('ilias-history', (event) => listeners.onHistory(event.payload)),
  ]);
  return () => stops.forEach((stop) => stop());
}
