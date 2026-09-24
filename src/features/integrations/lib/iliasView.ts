/**
 * ILIAS mode — the TypeScript side of `src-tauri/src/ilias_view.rs`.
 *
 * On the ILIAS page the window holds two webviews side by side: Uni Pilot
 * shrunk to a strip at the top, and ILIAS filling the rest. Rust lays them out,
 * because once Uni Pilot is the strip, the page can no longer see the window.
 * This module only says when to switch, and passes on the two numbers Rust
 * cannot measure itself: how tall the strip is, and how tall the page was
 * before it shrank.
 *
 * Desktop only. A browser tab cannot hold ILIAS at all — it forbids framing —
 * so there the page falls back to opening a tab (`iliasWindow.ts`).
 */

import { isDesktopRuntime } from '@/lib/icsFetch';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { resolveIliasTarget } from '@/features/integrations/lib/ilias/endpoints';

/** True where ILIAS can fill the Uni Pilot window. */
export function canEmbedIlias(): boolean {
  return isDesktopRuntime();
}

/**
 * Whether something is open that needs the whole window.
 *
 * In ILIAS mode Uni Pilot is only the strip, so a dialog would be cut off at
 * its edge. Only what the student opens on purpose counts: dialogs (the app's
 * `Modal`, a native `<dialog>`). Tooltips and reminders do not — they would
 * make ILIAS jump out of the way on hover or mid-sentence.
 */
export function overlayIsOpen(root: ParentNode = document): boolean {
  return root.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]') !== null;
}

// --- talking to Rust, in order --------------------------------------------

/**
 * Every call is sent strictly after the previous one finished. The commands
 * are async on the Rust side and could otherwise overtake each other — and
 * React mounts effects twice in development, so "enter, leave, enter" is
 * routine. If "leave" landed last, the ILIAS page would show a strip over an
 * empty window.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * How long one call may hold the queue. Laying out the window takes well under
 * a second; the limit only stops a call that never returns from leaving every
 * later one waiting behind it.
 */
const CALL_LIMIT_MS = 15_000;

function withinLimit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('ILIAS did not respond. Try leaving the page and coming back.')),
      CALL_LIMIT_MS,
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = () => withinLimit(work());
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

async function call(command: string, args: Record<string, unknown>): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(command, args);
}

/**
 * Checked here with the same rule Rust applies, so a refused link never
 * crosses. Synchronously, and that matters: checking in a `.then()` would
 * queue the call a tick late, and a `leaveIliasMode()` made right after would
 * overtake it — leaving ILIAS mode active on a page the student had left.
 */
function refusal(connection: IliasConnection, target: string | undefined): Error | null {
  try {
    resolveIliasTarget(connection.baseUrl, connection.clientId, target);
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause));
  }
}

/**
 * Switches the window to ILIAS mode.
 *
 * `stripHeight` is the strip as it will be once Uni Pilot shrinks to it.
 * `target` undefined keeps the page ILIAS was on; any string navigates, with
 * `''` meaning the dashboard.
 */
export function enterIliasMode(
  connection: IliasConnection,
  stripHeight: number,
  target?: string,
): Promise<void> {
  const refused = refusal(connection, target);
  if (refused) return Promise.reject(refused);
  // Read now, not when the call runs: by then an earlier enter in the queue
  // may already have shrunk the page to the strip. Before anything shrinks,
  // the page is the window minus whatever the title bar covers, and Rust
  // reads the title bar from that difference.
  const pageHeight = window.innerHeight;
  return enqueue(() =>
    call('enter_ilias_mode', {
      baseUrl: connection.baseUrl,
      clientId: connection.clientId,
      target: target ?? null,
      strip: stripHeight,
      pageHeight,
    }),
  );
}

/** Gives Uni Pilot the whole window back. ILIAS stays on its page, hidden. */
export function leaveIliasMode(): Promise<void> {
  return enqueue(() => call('leave_ilias_mode', {}));
}

/** Sends ILIAS somewhere while staying in ILIAS mode. `''` is the dashboard. */
export function navigateIlias(connection: IliasConnection, target: string): Promise<void> {
  const refused = refusal(connection, target);
  if (refused) return Promise.reject(refused);
  return enqueue(() =>
    call('navigate_ilias', {
      baseUrl: connection.baseUrl,
      clientId: connection.clientId,
      target,
    }),
  );
}

/** Removes ILIAS entirely and gives the window back — for disconnecting. */
export function closeIliasView(): Promise<void> {
  return enqueue(() => call('close_ilias_view', {}));
}
