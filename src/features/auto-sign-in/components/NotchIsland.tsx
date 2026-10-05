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
const OPEN_WIDTH = 440;
const OPEN_BELOW = 104;

/** How long the face sticks its tongue out when face unlock stops. */
export const TONGUE_MS = 2500;

type Mood = 'asleep' | 'looking' | 'happy' | 'beaming' | 'glum' | 'cheeky';

const MOOD_LABEL: Record<Mood, string> = {
  asleep: 'Uni Pilot, half asleep',
  looking: 'Uni Pilot, looking for you',
  happy: 'Uni Pilot, smiling',
  beaming: 'Uni Pilot, beaming',
  glum: 'Uni Pilot, glum',
  cheeky: 'Uni Pilot, sticking its tongue out',
};

function moodOf(phase: NotchPhase, teasing: boolean): Mood {
  switch (phase) {
    case 'starting':
    case 'paused':
      return 'asleep';
    case 'looking':
      return 'looking';
    case 'signingIn':
      return 'happy';
    case 'signedIn':
      return 'beaming';
    case 'stopped':
      return teasing ? 'cheeky' : 'glum';
  }
}

let events: Promise<typeof import('@tauri-apps/api/event')> | null = null;
const tauriEvents = () => (events ??= import('@tauri-apps/api/event'));

function send(event: string, payload?: unknown) {
  void tauriEvents()
    .then(({ emit }) => emit(event, payload))
    .catch(() => undefined);
}

/**
 * A small face: it wakes up, looks for the student, smiles while Uni Pilot
 * signs in and beams once it has. When face unlock stops, it squeezes its eyes
 * shut and sticks its tongue out for a moment (`teasing`), then looks glum.
 * Drawn in the island's own colour, so it reads on the black of the notch.
 */
export function NotchFace({ phase, teasing = false }: { phase: NotchPhase; teasing?: boolean }) {
  const mood = moodOf(phase, teasing);
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={MOOD_LABEL[mood]}
      className={cn(
        'h-14 w-14 flex-none text-notch-foreground',
        mood === 'cheeky' && 'animate-notch-boing',
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="16" cy="16" r="13" />
      {mood === 'asleep' ? (
        <>
          <path d="M9.5 14h4M18.5 14h4" />
          <path d="M12.5 21h7" />
        </>
      ) : mood === 'happy' || mood === 'beaming' ? (
        <>
          <path d="M9.5 14.5q2-2.5 4 0M18.5 14.5q2-2.5 4 0" />
          <path d={mood === 'beaming' ? 'M10 19q6 6 12 0' : 'M11.5 20q4.5 3.5 9 0'} />
        </>
      ) : mood === 'cheeky' ? (
        <>
          <path d="M9.5 11.5l3.5 2-3.5 2M22.5 11.5l-3.5 2 3.5 2" />
          <path d="M10 19h12" />
          <g className="animate-notch-tongue">
            <path d="M13 19h6v3.2a3 3 0 0 1-6 0z" className="fill-coral" stroke="none" />
            <path d="M16 19.6v2.4" className="stroke-notch" strokeWidth={0.8} />
          </g>
        </>
      ) : (
        <>
          <g className={mood === 'looking' ? 'animate-notch-look' : undefined}>
            <circle cx="12" cy="14" r="1.6" fill="currentColor" className="animate-notch-blink" />
            <circle cx="20" cy="14" r="1.6" fill="currentColor" className="animate-notch-blink" />
          </g>
          <path d={mood === 'glum' ? 'M12 21h8' : 'M12.5 20.5q3.5 2 7 0'} />
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
  const [teasedAt, setTeasedAt] = useState<number | null>(null);
  const lastPhase = useRef<NotchPhase | null>(null);
  const island = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    void tauriEvents()
      .then(async ({ listen }) => {
        const unlisten = await listen<NotchPainting | null>('notch-state', (event) => {
          const next = event.payload;
          // A fresh stop, not the same one painted again: tongue out.
          if (next?.phase === 'stopped' && lastPhase.current !== 'stopped') {
            setTeasedAt(Date.now());
          }
          lastPhase.current = next?.phase ?? null;
          setPainting(next);
        });
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

  useEffect(() => {
    if (teasedAt === null) return;
    const timer = setTimeout(() => setTeasedAt(null), TONGUE_MS);
    return () => clearTimeout(timer);
  }, [teasedAt]);

  const notchWidth = painting?.notchWidth ?? 200;
  const notchHeight = painting?.notchHeight ?? 32;
  const open = painting !== null;
  const phase = painting?.phase ?? 'starting';
  const busy = phase === 'signingIn' || phase === 'signedIn';
  const teasing = teasedAt !== null && phase === 'stopped';

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
          <div className="flex flex-col gap-2.5 px-5" style={{ paddingTop: notchHeight + 8 }}>
            <div className="flex items-center gap-4">
              <NotchFace phase={phase} teasing={teasing} />
              <p
                role="status"
                className="min-w-0 flex-1 text-[13px] leading-snug text-notch-foreground"
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
