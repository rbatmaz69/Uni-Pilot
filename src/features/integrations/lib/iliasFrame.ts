/**
 * What the page tells Rust about its own layout in ILIAS mode, and how it
 * reads it.
 *
 * Uni Pilot's webview is only the left column there — the icon rail and the
 * ILIAS panel — and Rust places ILIAS beside it (`src-tauri/src/ilias_view.rs`).
 * Rust cannot see the page's CSS, so the page reports three things:
 *
 * - the column's width: the right edge of the panel, as laid out;
 * - the frame's gutter (`--frame-gutter`): the space ILIAS leaves free above,
 *   right of and below it, like the card on every other page;
 * - the frame's colour (`--frame-to`): what shows in that gutter, because no
 *   webview covers it and the window's own background does.
 *
 * Pure, so it is tested without Tauri. Nothing is read from the ILIAS page.
 */

/** Red, green and blue, 0 to 255. */
export type FrameColour = readonly [number, number, number];

export interface IliasMetrics {
  /** Width of the rail and the panel, in CSS pixels. */
  column: number;
  /** The frame's gutter around the card, in CSS pixels. */
  gutter: number;
  /** The frame's colour; null where it could not be read, which leaves the window as it is. */
  frame: FrameColour | null;
}

/**
 * The rail (72px) and the ILIAS panel (240px), for where nothing can be
 * measured — a test, where nothing is laid out. In the app the panel is
 * measured, so this never needs to agree with the stylesheet.
 */
export const FALLBACK_COLUMN = 312;

/** `--frame-gutter` when the stylesheet is not there to ask. */
export const FALLBACK_GUTTER = 4;

/**
 * The right edge of the panel in the page, which is the column's width: the
 * rail is flush against the left edge and the panel follows it directly.
 */
export function measureColumn(panel: Element | null): number {
  const right = panel?.getBoundingClientRect().right ?? 0;
  return right > 0 ? Math.round(right) : FALLBACK_COLUMN;
}

/** `--frame-gutter` in CSS pixels. */
export function readGutter(root: Element = document.documentElement): number {
  const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--frame-gutter'));
  return Number.isFinite(gutter) && gutter >= 0 ? gutter : FALLBACK_GUTTER;
}

/** `--frame-to` — the colour the frame ends in, which the page's background is too. */
export function readFrameColour(root: Element = document.documentElement): FrameColour | null {
  return parseCssColour(getComputedStyle(root).getPropertyValue('--frame-to'));
}

export function sameMetrics(a: IliasMetrics, b: IliasMetrics): boolean {
  return a.column === b.column && a.gutter === b.gutter && a.frame?.join() === b.frame?.join();
}

// --- colours ---------------------------------------------------------------

const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

function number(text: string): number {
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text);
}

/** Linear light to sRGB, 0 to 1. */
function encode(linear: number): number {
  const value = Math.min(1, Math.max(0, linear));
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Oklch (CSS Color 4) to sRGB, clipped to the gamut. */
function fromOklch(lightness: number, chroma: number, hue: number): FrameColour {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    channel(255 * encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    channel(255 * encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    channel(255 * encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/**
 * A CSS colour as red, green and blue — what Rust sets the window to. The
 * tokens are written as hex and as `oklch()`, so those are read, and plain
 * `rgb()` as a browser reports a computed colour. Anything else, and an empty
 * value, is `null`: better to leave the window alone than to guess.
 *
 * Opacity is ignored; the gutter is opaque.
 */
export function parseCssColour(value: string): FrameColour | null {
  const text = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const at = (start: number) => Number.parseInt(full.slice(start, start + 2), 16);
    return [at(0), at(2), at(4)];
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/.exec(text)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter(Boolean);
    const [red, green, blue] = parts.slice(0, 3).map((part) => {
      const parsed = number(part);
      return part.endsWith('%') ? parsed * 255 : parsed;
    });
    if (red === undefined || green === undefined || blue === undefined) return null;
    if (![red, green, blue].every(Number.isFinite)) return null;
    return [channel(red), channel(green), channel(blue)];
  }

  const oklch = /^oklch\(\s*([^)]+)\)$/.exec(text)?.[1];
  if (oklch) {
    const parts = oklch.split(/[\s/]+/).filter(Boolean);
    const [lightness, chroma, hue] = parts;
    if (lightness === undefined || chroma === undefined || hue === undefined) return null;
    const l = number(lightness);
    // A percentage of chroma is a percentage of 0.4.
    const c = chroma.endsWith('%') ? number(chroma) * 0.4 : number(chroma);
    const h = hue === 'none' ? 0 : Number.parseFloat(hue);
    if (![l, c, h].every(Number.isFinite)) return null;
    return fromOklch(l, c, h);
  }

  return null;
}
