/**
 * Opening ILIAS from anywhere in the app.
 *
 * In the desktop app this asks Rust for a window of its own (see
 * `src-tauri/src/ilias_window.rs` for why it is made there and not here). In a
 * browser tab — `npm run dev` — there is no such thing, so it opens a new tab
 * instead. The controls look the same in both; only where ILIAS appears differs.
 *
 * The target is checked here first, with the same rule Rust applies, so a
 * refused link fails the same way with the same message in both places and
 * never crosses into Rust at all. Rust still checks again: it is the gate that
 * cannot be skipped by anything running in the webview.
 */

import { isDesktopRuntime } from '@/lib/icsFetch';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { resolveIliasTarget } from '@/features/integrations/lib/ilias/endpoints';

/** True where ILIAS opens inside Uni Pilot rather than in a browser tab. */
export function canOpenIliasWindow(): boolean {
  return isDesktopRuntime();
}

/**
 * Opens ILIAS at the dashboard, or at `target` — a `crs_717` shorthand or a
 * link from the same installation, such as the one in an ILIAS calendar entry.
 *
 * Takes the stored connection rather than a loose address so the client id
 * cannot be forgotten on the way.
 */
export async function openIlias(connection: IliasConnection, target?: string): Promise<void> {
  const url = resolveIliasTarget(connection.baseUrl, connection.clientId, target);

  if (isDesktopRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_ilias', {
      baseUrl: connection.baseUrl,
      clientId: connection.clientId,
      target: target ?? null,
    });
    return;
  }

  // Not `noopener` in the features string: with it, window.open returns null
  // whether or not the tab opened, and a blocked pop-up could not be told
  // apart from a working one. Cutting `opener` by hand has the same effect —
  // the ILIAS tab cannot reach back into Uni Pilot, the browser's equivalent
  // of the desktop window having no IPC.
  const opened = window.open(url, '_blank');
  if (opened === null) {
    throw new Error('The browser blocked the new tab. Allow pop-ups for Uni Pilot and try again.');
  }
  opened.opener = null;
}

/**
 * Whether a link belongs to the connected ILIAS, so the UI only offers
 * "Open in ILIAS" where it will actually work.
 */
export function belongsToIlias(connection: IliasConnection, link: string): boolean {
  try {
    resolveIliasTarget(connection.baseUrl, connection.clientId, link);
    return true;
  } catch {
    return false;
  }
}
