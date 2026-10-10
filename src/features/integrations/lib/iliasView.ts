/**
 * ILIAS mode — the TypeScript side of `src-tauri/src/ilias_view.rs`.
 *
 * On the ILIAS page the window holds two webviews side by side: Uni Pilot
 * shrunk to the left column (the icon rail and the ILIAS panel), and ILIAS as
 * the card to its right. Rust lays them out, because once Uni Pilot is the
 * column, the page can no longer see the window. This module only says when to
 * switch, and passes on what Rust cannot measure itself (`IliasMetrics`): how
 * wide the column is, how wide the frame's gutter is and what colour, and how
 * tall the page was before it shrank.
 *
 * Desktop only. A browser tab cannot hold ILIAS at all — it forbids framing —
 * so there the page falls back to opening a tab (`iliasWindow.ts`).
 */

import { isDesktopRuntime } from '@/lib/icsFetch';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { resolveIliasTarget } from '@/features/integrations/lib/ilias/endpoints';
import type { IliasMetrics } from '@/features/integrations/lib/iliasFrame';

/** True where ILIAS can fill the Uni Pilot window. */
export function canEmbedIlias(): boolean {
  return isDesktopRuntime();
}

/**
 * Whether something is open that needs the whole window.
 *
 * In ILIAS mode Uni Pilot is only the left column, so a dialog would be cut off
 * at its edge. Only what the student opens on purpose counts: dialogs (the app's
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
 * routine. If "leave" landed last, the ILIAS page would show the column beside
 * an empty window.
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

/** What Rust takes of the page's layout: the same three numbers, as it names them. */
function layoutArgs(metrics: IliasMetrics) {
  return { column: metrics.column, gutter: metrics.gutter, frame: metrics.frame };
}

/**
 * Switches the window to ILIAS mode.
 *
 * `metrics` is the layout the page has in ILIAS mode: the column Uni Pilot
 * shrinks to and the frame around ILIAS. `target` undefined keeps the page
 * ILIAS was on; any string navigates, with `''` meaning the dashboard.
 */
export function enterIliasMode(
  connection: IliasConnection,
  metrics: IliasMetrics,
  target?: string,
): Promise<void> {
  const refused = refusal(connection, target);
  if (refused) return Promise.reject(refused);
  // Read now, not when the call runs. The page keeps the window's height in
  // the column too, but only before anything shrinks is it certain to be the
  // window minus whatever the title bar covers — and Rust reads the title bar
  // from that difference.
  const pageHeight = window.innerHeight;
  return enqueue(() =>
    call('enter_ilias_mode', {
      baseUrl: connection.baseUrl,
      clientId: connection.clientId,
      target: target ?? null,
      ...layoutArgs(metrics),
      pageHeight,
    }),
  );
}

/**
 * Tells Rust the column, gutter or frame colour changed while in ILIAS mode —
 * the theme was switched, say. Rust ignores it when ILIAS mode is not on, so a
 * late call cannot switch it back on.
 */
export function setIliasLayout(metrics: IliasMetrics): Promise<void> {
  return enqueue(() => call('set_ilias_layout', layoutArgs(metrics)));
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
