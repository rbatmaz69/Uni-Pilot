/**
 * ILIAS embedded in the Uni Pilot window — the TypeScript side of
 * `src-tauri/src/ilias_view.rs`.
 *
 * The view is a native webview laid *over* the page, not an element in it, so
 * the page has to say where it goes and when to step aside. That is all this
 * module does: measure, and pass on in order.
 *
 * Desktop only. A browser tab cannot embed ILIAS at all — it forbids framing —
 * so there the page falls back to opening a tab (`iliasWindow.ts`).
 */

import { isDesktopRuntime } from '@/lib/icsFetch';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { resolveIliasTarget } from '@/features/integrations/lib/ilias/endpoints';

/** Logical pixels, relative to the window's content — what the Rust side expects. */
export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True where ILIAS can sit inside the Uni Pilot window. */
export function canEmbedIlias(): boolean {
  return isDesktopRuntime();
}

/**
 * Where an element sits in the window. Rounded, because a webview at a
 * fractional position renders with soft edges and leaves hairline gaps.
 */
export function boundsOf(element: Element): ViewBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

/**
 * Whether the student has opened something the view would cover.
 *
 * The view is native and sits above every element of the page, so a dialog
 * rendered into the page would open *underneath* ILIAS. Only what the student
 * opens on purpose counts: dialogs (the app's `Modal`, the header's search and
 * notifications, which are a native `<dialog>`). Tooltips and reminders do not
 * — hiding ILIAS on hover would make it flicker, and a reminder should not make
 * a half-written forum post vanish.
 */
export function overlayIsOpen(root: ParentNode = document): boolean {
  return root.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]') !== null;
}

// --- talking to Rust, in order --------------------------------------------

/**
 * Every call is sent strictly after the previous one finished. The commands
 * are async on the Rust side and could otherwise overtake each other — and
 * React mounts effects twice in development, so "show, hide, show" is routine.
 * If "hide" landed last, ILIAS would stay invisible on an open ILIAS page.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * How long one call may hold the queue. Creating the view takes well under a
 * second; the limit is only there so a call that never returns cannot leave
 * every later one waiting behind it — the ILIAS page would be dead until the
 * app restarted.
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
 * Shows ILIAS over `bounds`, creating the view the first time.
 *
 * `target` undefined keeps the page the student was on; any string navigates,
 * with `''` meaning the dashboard. It is checked here with the same rule Rust
 * applies, so a refused link fails before crossing over.
 */
export function showIliasView(
  connection: IliasConnection,
  bounds: ViewBounds,
  target?: string,
): Promise<void> {
  try {
    resolveIliasTarget(connection.baseUrl, connection.clientId, target);
  } catch (cause) {
    return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
  }
  return enqueue(() =>
    call('show_ilias_view', {
      baseUrl: connection.baseUrl,
      clientId: connection.clientId,
      target: target ?? null,
      bounds,
    }),
  );
}

/**
 * Only the latest position matters. While the sidebar animates, the page
 * reports new bounds every frame; sending each would queue up a backlog the
 * view then trails behind. So a placement already waiting just takes the
 * newest bounds instead of queueing another.
 */
let pendingBounds: ViewBounds | null = null;
let placing: Promise<void> = Promise.resolve();

export function placeIliasView(bounds: ViewBounds): Promise<void> {
  const waiting = pendingBounds !== null;
  pendingBounds = bounds;
  if (waiting) return placing;

  placing = enqueue(async () => {
    const latest = pendingBounds;
    pendingBounds = null;
    if (latest) await call('place_ilias_view', { bounds: latest });
  });
  return placing;
}

/** Steps aside, keeping the page and the sign-in. */
export function hideIliasView(): Promise<void> {
  return enqueue(() => call('hide_ilias_view', {}));
}

/** Removes the view entirely — for disconnecting. */
export function closeIliasView(): Promise<void> {
  return enqueue(() => call('close_ilias_view', {}));
}
