import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  countSheets,
  sheetAt,
  sheetClipPath,
  sheetGeometry,
  stackHeight,
  stepZoom,
  type SheetGeometry,
} from './pageSheets';

// 800 px wide: an A4 sheet 1131 px high with 76 px margins and a 28 px gap.
const geometry = sheetGeometry({ width: 800, marginTop: 76, marginBottom: 76, gap: 28 })!;
/** Where text ends that fills `pages` sheets and `extra` pixels more, with the boundaries in place. */
function endOf(pages: number, extra: number, layout: SheetGeometry = geometry) {
  return layout.marginTop + (pages - 1) * layout.stride + extra;
}

describe('sheetGeometry', () => {
  it('keeps the A4 proportion and derives the writable height', () => {
    expect(geometry).toEqual({
      height: 1131,
      gap: 28,
      marginTop: 76,
      content: 979,
      breakHeight: 180,
      stride: 1159,
    });
  });

  it('has no sheets before the page has a width or when margins leave no room', () => {
    expect(sheetGeometry({ width: 0, marginTop: 76, marginBottom: 76, gap: 28 })).toBeNull();
    expect(sheetGeometry({ width: 100, marginTop: 76, marginBottom: 76, gap: 28 })).toBeNull();
  });
});

describe('countSheets', () => {
  it('uses one sheet for a short or empty note', () => {
    expect(countSheets(geometry.marginTop, 1, geometry)).toBe(1);
    expect(countSheets(endOf(1, 300), 1, geometry)).toBe(1);
  });

  it('adds the second sheet only once the first is full', () => {
    expect(countSheets(endOf(1, geometry.content), 1, geometry)).toBe(1);
    expect(countSheets(endOf(1, geometry.content + 1), 1, geometry)).toBe(2);
  });

  it('stays on the pages already laid out while the text ends inside them', () => {
    expect(countSheets(endOf(2, 40), 2, geometry)).toBe(2);
    expect(countSheets(endOf(3, geometry.content), 3, geometry)).toBe(3);
  });

  it('counts a long note in one step while it still sits on a single sheet', () => {
    const fivePages = geometry.marginTop + 5 * geometry.content - 20;
    expect(countSheets(fivePages, 1, geometry)).toBe(5);
  });

  it('gives sheets back when text is removed', () => {
    expect(countSheets(endOf(1, 200), 4, geometry)).toBe(1);
    expect(countSheets(endOf(2, 10), 4, geometry)).toBe(2);
  });
});

describe('stackHeight', () => {
  it('adds a gap between sheets but not after the last', () => {
    expect(stackHeight({ ...geometry, count: 1 })).toBe(1131);
    expect(stackHeight({ ...geometry, count: 3 })).toBe(3 * 1131 + 2 * 28);
  });
});

describe('sheetClipPath', () => {
  it('shows the first sheet with its top margin and each later sheet’s writable area', () => {
    const path = sheetClipPath({ ...geometry, count: 2 });
    expect(path).toBe(
      'polygon(' +
        [
          '-100vw -76px',
          'calc(100% + 100vw) -76px',
          'calc(100% + 100vw) 979px',
          '-100vw 979px',
          '-100vw 1159px',
          'calc(100% + 100vw) 1159px',
          'calc(100% + 100vw) calc(100% + 100vh)',
          '-100vw calc(100% + 100vh)',
        ].join(', ') +
        ')',
    );
  });
});

describe('zoom', () => {
  it('steps through the usual zoom levels, also from a pinched zoom between them', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.8, -1)).toBe(0.75);
    expect(stepZoom(0.8, 1)).toBe(0.9);
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(stepZoom(2, 1)).toBe(2);
  });

  it('keeps a zoom in range and at whole percents', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.6666)).toBe(0.67);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('finds the sheet at a height of the zoomed stack', () => {
    const stack = { ...geometry, count: 3 };
    expect(sheetAt(0, stack, 1)).toBe(1);
    expect(sheetAt(1200, stack, 1)).toBe(2);
    // At half size the second sheet starts half as far down.
    expect(sheetAt(600, stack, 0.5)).toBe(2);
    expect(sheetAt(99999, stack, 1)).toBe(3);
  });
});
