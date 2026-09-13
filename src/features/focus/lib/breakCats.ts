/**
 * The break companion plays as two clips back to back: the cat walks in and settles
 * down, then naps on a loop until the break is over. The last frame of `arrive` is
 * the pose `sleep` loops on, so the handover is invisible.
 *
 * The files ship under `public/` rather than IndexedDB because the packaged app is
 * served from `'self'`: the Tauri CSP sets no `media-src`, so it falls back to
 * `default-src 'self'` and a `blob:` source would be refused.
 */
export const BREAK_CAT_CLIPS = {
  arrive: '/focus/cats/cat-arrive.webm',
  sleep: '/focus/cats/cat-sleep.webm',
} as const;

export type BreakCatStage = keyof typeof BREAK_CAT_CLIPS;

export const BREAK_CAT_LABEL = 'A cat naps on screen while your break runs';
