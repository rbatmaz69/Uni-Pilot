import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** `Phase` in `src-tauri/src/notch.rs`. */
export type NotchPhase = 'starting' | 'looking' | 'signingIn' | 'signedIn' | 'paused' | 'stopped';

/** What Rust hands the notch page: `Painted` in `src-tauri/src/notch.rs`. */
export interface NotchPainting {
  phase: NotchPhase;
  text: string;
  again: boolean;
  camera: boolean;
  notchWidth: number;
  notchHeight: number;
}

export type NotchAction = 'cancel' | 'password' | 'retry' | 'open';

/** The island opened: wide enough for a face, a sentence and two buttons. */
const OPEN_WIDTH = 380;
const OPEN_BELOW = 74;

let events: Promise<typeof import('@tauri-apps/api/event')> | null = null;
const tauriEvents = () => (events ??= import('@tauri-apps/api/event'));

function send(event: string, payload?: unknown) {
  void tauriEvents()
    .then(({ emit }) => emit(event, payload))
    .catch(() => undefined);
}

/**
 * A small face: it wakes up, looks for the student, smiles while Uni Pilot
 * signs in and beams once it has. Drawn in the island's own colour, so it
 * reads on the black of the notch.
 */
export function NotchFace({ phase }: { phase: NotchPhase }) {
  const asleep = phase === 'starting' || phase === 'paused';
  const happy = phase === 'signingIn' || phase === 'signedIn';
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className="h-8 w-8 flex-none text-notch-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="16" cy="16" r="13" />
      {asleep ? (
        <>
          <path d="M9.5 14h4M18.5 14h4" />
          <path d="M12.5 21h7" />
        </>
      ) : happy ? (
        <>
          <path d="M9.5 14.5q2-2.5 4 0M18.5 14.5q2-2.5 4 0" />
          <path d={phase === 'signedIn' ? 'M10 19q6 6 12 0' : 'M11.5 20q4.5 3.5 9 0'} />
        </>
      ) : (
        <>
          <g className={phase === 'looking' ? 'animate-notch-look' : undefined}>
            <circle cx="12" cy="14" r="1.6" fill="currentColor" className="animate-notch-blink" />
            <circle cx="20" cy="14" r="1.6" fill="currentColor" className="animate-notch-blink" />
          </g>
          <path d={phase === 'stopped' ? 'M12 21h8' : 'M12.5 20.5q3.5 2 7 0'} />
        </>
      )}
    </svg>
  );
}

function Control({ action, children }: { action: NotchAction; children: string }) {
  return (
    <button
      type="button"
      onClick={() => send('notch-action', { action })}
      className="rounded-full bg-notch-control px-2.5 py-1 text-[11px] font-medium text-notch-foreground transition-colors hover:bg-notch-control-hover"
    >
      {children}
    </button>
  );
}

/**
 * The page of the notch window (`notch.html`, `src-tauri/src/notch.rs`): an
 * island that grows out of the MacBook's notch while face unlock runs and
 * folds back into it when it is done. It only paints what Rust hands it —
 * a phase and a sentence, never a frame — and reports clicks as events; the
 * camera and every face command stay with Uni Pilot's own page.
 */
export function NotchIsland() {
  const [painting, setPainting] = useState<NotchPainting | null>(null);
  const island = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    void tauriEvents()
      .then(async ({ listen }) => {
        const unlisten = await listen<NotchPainting | null>('notch-state', (event) =>
          setPainting(event.payload),
        );
        if (!alive) {
          unlisten();
          return;
        }
        stop = unlisten;
        send('notch-ready');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  // Where the island is, so a click beside it reaches the menu bar — told
  // again once it has finished growing or shrinking.
  const reportHit = (shown: boolean) => {
    const box = island.current?.getBoundingClientRect();
    send(
      'notch-hit',
      shown && box
        ? { x: box.left, y: box.top, width: box.width, height: box.height }
        : { x: 0, y: 0, width: 0, height: 0 },
    );
  };
  useEffect(() => reportHit(painting !== null), [painting]);

  const notchWidth = painting?.notchWidth ?? 200;
  const notchHeight = painting?.notchHeight ?? 32;
  const open = painting !== null;
  const phase = painting?.phase ?? 'starting';
  const busy = phase === 'signingIn' || phase === 'signedIn';

  return (
    <div className="flex justify-center">
      <div
        ref={island}
        data-open={open}
        onTransitionEnd={() => reportHit(open)}
        className={cn(
          'overflow-hidden rounded-b-2xl bg-notch text-notch-foreground transition-[width,height,opacity] duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          width: open ? OPEN_WIDTH : notchWidth,
          height: open ? notchHeight + OPEN_BELOW : notchHeight,
        }}
      >
        {painting ? (
          <div className="flex flex-col gap-2 px-4" style={{ paddingTop: notchHeight + 6 }}>
            <div className="flex items-center gap-3">
              <NotchFace phase={phase} />
              <p
                role="status"
                className="min-w-0 flex-1 text-[12px] leading-snug text-notch-foreground"
              >
                {painting.text}
              </p>
              {painting.camera ? (
                <span className="flex flex-none items-center gap-1 text-[10.5px] text-notch-muted">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
                  Camera on
                </span>
              ) : null}
            </div>
            {busy ? null : (
              <div className="flex justify-end gap-1.5">
                {phase === 'paused' ? <Control action="open">Open Uni Pilot</Control> : null}
                {phase === 'stopped' && painting.again ? (
                  <Control action="retry">Try again</Control>
                ) : null}
                <Control action="password">Use password</Control>
                <Control action="cancel">{phase === 'stopped' ? 'Close' : 'Cancel'}</Control>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
