/**
 * Geometry of the notebook page style. The note flows through CSS columns:
 * every column is one paper page, two pages form a spread, and turning a page
 * scrolls the flow by exactly one spread width.
 */
export type NotebookGeometry = {
  /** Width of the open spread (both pages) in pixels. */
  spread: number;
  /** Width of a single page. */
  page: number;
  /** Writing margin on each side of a page. */
  padding: number;
};

/** A divider tab: a heading of the note and the spread it starts on. */
export type NotebookSection = { label: string; spread: number };

export const MAX_SECTION_TABS = 8;
export const MAX_EDGE_LAYERS = 8;

export function notebookGeometry(spread: number): NotebookGeometry {
  const width = Math.max(0, spread);
  return {
    spread: width,
    page: width / 2,
    padding: Math.round(Math.min(64, Math.max(28, width * 0.045))),
  };
}

/**
 * Pages the flow occupies, from where the note's last block ends (measured
 * from the first page). A column ends one margin before its page does, hence
 * the added padding.
 */
export function countPages(contentEnd: number, geometry: NotebookGeometry): number {
  if (geometry.page <= 0) return 2;
  return Math.max(1, Math.round((contentEnd + geometry.padding) / geometry.page));
}

export function countSpreads(pages: number): number {
  return Math.max(1, Math.ceil(pages / 2));
}

/** The spread that holds a horizontal offset measured from the first page. */
export function spreadAt(offset: number, geometry: NotebookGeometry): number {
  if (geometry.spread <= 0) return 0;
  return Math.max(0, Math.floor(offset / geometry.spread));
}

export function clampSpread(spread: number, spreads: number): number {
  return Math.min(Math.max(0, spread), Math.max(0, spreads - 1));
}

/**
 * The tab to mark: the first section opening on this spread, or else the one
 * still running from an earlier spread.
 */
export function activeSection(sections: NotebookSection[], spread: number): number {
  const opening = sections.findIndex((section) => section.spread === spread);
  if (opening >= 0) return opening;
  let active = -1;
  sections.forEach((section, index) => {
    if (section.spread < spread) active = index;
  });
  return active;
}

/** Paper layers visible at the left and right edge, like a real stack of sheets. */
export function edgeLayers(spread: number, spreads: number) {
  const progress = spreads > 1 ? spread / (spreads - 1) : 0;
  return {
    left: Math.max(2, Math.round(progress * MAX_EDGE_LAYERS)),
    right: Math.max(2, Math.round((1 - progress) * MAX_EDGE_LAYERS)),
  };
}

/** Every spread is two sheets of paper, even when the note ends on the left one. */
export function pagesLabel(spread: number, spreads: number): string {
  return `Pages ${spread * 2 + 1}–${spread * 2 + 2} of ${Math.max(1, spreads) * 2}`;
}

/** Riffling through a distant section shows at most this many sheets. */
export const MAX_RIFFLE_SHEETS = 4;

/**
 * The spreads a riffle lands on, ending at the target. Far jumps skip
 * evenly so the whole trip takes about the same time.
 */
export function riffleSteps(from: number, to: number): number[] {
  const distance = Math.abs(to - from);
  if (distance === 0) return [];
  const sheets = Math.min(distance, MAX_RIFFLE_SHEETS);
  return Array.from({ length: sheets }, (_, index) =>
    Math.round(from + ((to - from) * (index + 1)) / sheets),
  );
}

/**
 * How far a dragged sheet has turned, 0 (flat) to 1 (over), from how far the
 * pointer travelled across the book towards the other side.
 */
export function dragProgress(travelled: number, bookWidth: number): number {
  if (bookWidth <= 0) return 0;
  return Math.min(1, Math.max(0, travelled / bookWidth));
}

/** A released sheet completes the turn once past this point, or when flicked. */
export function releaseCompletes(progress: number, velocity: number): boolean {
  if (velocity > 0.6) return true;
  if (velocity < -0.6) return false;
  return progress > 0.38;
}
