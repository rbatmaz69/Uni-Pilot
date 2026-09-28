import type { CSSProperties } from 'react';

/**
 * The paged note layout: A4 sheets stacked with a gap, like a word
 * processor's print layout. The text stays one continuous flow; a full-width
 * float at every page boundary pushes the lines that would cross it onto the
 * next sheet, so paragraphs break between lines, not between blocks.
 */

/** A4 is 210 × 297 mm: its height is its width times √2. */
export const A4_RATIO = Math.SQRT2;

export interface SheetMetrics {
  /** Border-box width of one sheet, in pixels. */
  width: number;
  marginTop: number;
  marginBottom: number;
  /** Space between two sheets. */
  gap: number;
}

export interface SheetGeometry {
  height: number;
  gap: number;
  marginTop: number;
  /** The writable height of one sheet. */
  content: number;
  /** What a boundary takes: one sheet's bottom margin, the gap and the next sheet's top margin. */
  breakHeight: number;
  /** From the top of one sheet to the top of the next. */
  stride: number;
}

export interface SheetStack extends SheetGeometry {
  count: number;
}

export interface SheetLayout extends SheetStack {
  /** How far below the first sheet's writable top the editable text starts (cover and title). */
  lead: number;
}

export function sheetGeometry({
  width,
  marginTop,
  marginBottom,
  gap,
}: SheetMetrics): SheetGeometry | null {
  const height = Math.round(width * A4_RATIO);
  const content = height - marginTop - marginBottom;
  if (!(width > 0) || content <= 0) return null;
  return {
    height,
    gap,
    marginTop,
    content,
    breakHeight: marginBottom + gap + marginTop,
    stride: height + gap,
  };
}

/**
 * How many sheets the text needs. `bottom` is where the text ends, measured
 * from the top of the first sheet while `current` sheets are laid out. The
 * boundaries above it are taken out again, so a long note that opens on a
 * single sheet is counted in one step instead of one page per layout pass.
 */
export function countSheets(bottom: number, current: number, geometry: SheetGeometry): number {
  const { marginTop, content, breakHeight, stride } = geometry;
  // Boundary j (from 1) starts at marginTop + j·stride − breakHeight.
  const passed = Math.ceil((bottom - marginTop + breakHeight) / stride) - 1;
  const crossed = Math.min(Math.max(current - 1, 0), Math.max(passed, 0));
  const written = bottom - marginTop - crossed * breakHeight;
  // Half a pixel of tolerance: a note that fills a page exactly needs no second one.
  return Math.max(1, Math.ceil((written - 0.5) / content));
}

/** The height of the whole stack, gaps included. */
export function stackHeight({ count, height, gap }: SheetStack): number {
  return count * height + (count - 1) * gap;
}

/**
 * Limits the text layer to the writable part of each sheet, so no block that
 * straddles a boundary (a quote's bar, a card's paper) shows in a margin or a
 * gap. Coordinates are relative to the text layer, which starts at the first
 * sheet's top margin; the first band keeps that margin for the cover, and the
 * last one stays open while a new sheet is still on its way.
 */
export function sheetClipPath(layout: SheetStack): string {
  const left = '-100vw';
  const right = 'calc(100% + 100vw)';
  const points: string[] = [];
  for (let index = 0; index < layout.count; index += 1) {
    const top = index === 0 ? `${-layout.marginTop}px` : `${index * layout.stride}px`;
    const bottom =
      index === layout.count - 1
        ? 'calc(100% + 100vh)'
        : `${index * layout.stride + layout.content}px`;
    points.push(`${left} ${top}`, `${right} ${top}`, `${right} ${bottom}`, `${left} ${bottom}`);
  }
  // The bands share their left edge, which the path runs down and back up at
  // no width, so the gaps between them stay outside.
  return `polygon(${points.join(', ')})`;
}

/** The sizes the stack and its text layer read from CSS. */
export function sheetStackStyle(layout: SheetLayout): CSSProperties {
  return {
    minHeight: stackHeight(layout),
    '--note-sheet-content': `${layout.content}px`,
    '--note-sheet-break': `${layout.breakHeight}px`,
    // The boundaries sit inside the editor, which starts below the title.
    '--note-sheet-first': `${Math.max(0, layout.content - layout.lead)}px`,
    '--note-sheet-clip': sheetClipPath(layout),
  } as CSSProperties;
}

/** The zoom steps of the − and + buttons, as in a word processor. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const MIN_ZOOM = ZOOM_STEPS[0]!;
export const MAX_ZOOM = ZOOM_STEPS.at(-1)!;

/** Keeps a zoom, also one from a pinch, within range and at whole percents. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;
}

/** The next step up or down from any zoom, including one between steps. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((step) => step > zoom + 0.001)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001);
  return next ?? (direction > 0 ? MAX_ZOOM : MIN_ZOOM);
}

/** Which sheet (from 1) lies at `y`, measured from the top of the zoomed stack. */
export function sheetAt(y: number, layout: SheetStack, zoom: number): number {
  const index = Math.floor(y / (layout.stride * zoom));
  return Math.min(layout.count, Math.max(1, index + 1));
}
