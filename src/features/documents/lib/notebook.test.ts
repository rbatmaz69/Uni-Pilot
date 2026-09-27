import { describe, expect, it } from 'vitest';
import {
  activeSection,
  clampSpread,
  countPages,
  countSpreads,
  dragProgress,
  edgeLayers,
  MAX_EDGE_LAYERS,
  notebookGeometry,
  pagesLabel,
  releaseCompletes,
  riffleSteps,
  spreadAt,
} from '@/features/documents/lib/notebook';

describe('notebook geometry', () => {
  const geometry = notebookGeometry(1200);

  it('splits a spread into two pages with a bounded writing margin', () => {
    expect(geometry).toEqual({ spread: 1200, page: 600, padding: 54 });
    expect(notebookGeometry(200).padding).toBe(28);
    expect(notebookGeometry(4000).padding).toBe(64);
  });

  it('counts the pages up to where the last block ends', () => {
    // Ending in the second column: it stops one margin before page 2 does.
    expect(countPages(1200 - 54, geometry)).toBe(2);
    expect(countPages(600 - 54, geometry)).toBe(1);
    // A third column ends one margin before the third page does.
    expect(countPages(3 * 600 - 54, geometry)).toBe(3);
    expect(countPages(0, notebookGeometry(0))).toBe(2);
  });

  it('groups pages into spreads and keeps navigation inside the notebook', () => {
    expect(countSpreads(1)).toBe(1);
    expect(countSpreads(3)).toBe(2);
    expect(clampSpread(-1, 3)).toBe(0);
    expect(clampSpread(9, 3)).toBe(2);
  });

  it('finds the spread holding an offset, e.g. the caret', () => {
    expect(spreadAt(40, geometry)).toBe(0);
    expect(spreadAt(1199, geometry)).toBe(0);
    expect(spreadAt(1200, geometry)).toBe(1);
    expect(spreadAt(-5, geometry)).toBe(0);
  });
});

describe('notebook sections and depth', () => {
  const sections = [
    { label: 'Intro', spread: 0 },
    { label: 'Proofs', spread: 2 },
    { label: 'Exercises', spread: 4 },
  ];

  it('marks the tab of the section being read', () => {
    expect(activeSection(sections, 0)).toBe(0);
    expect(activeSection(sections, 3)).toBe(1);
    expect(activeSection(sections, 9)).toBe(2);
    expect(activeSection([{ label: 'Late', spread: 2 }], 1)).toBe(-1);
    // Two sections on one spread: the one the spread opens with.
    expect(
      activeSection(
        [
          { label: 'A', spread: 0 },
          { label: 'B', spread: 0 },
        ],
        0,
      ),
    ).toBe(0);
  });

  it('moves paper from the right stack to the left while reading', () => {
    expect(edgeLayers(0, 5)).toEqual({ left: 2, right: MAX_EDGE_LAYERS });
    expect(edgeLayers(4, 5)).toEqual({ left: MAX_EDGE_LAYERS, right: 2 });
    expect(edgeLayers(0, 1)).toEqual({ left: 2, right: MAX_EDGE_LAYERS });
  });

  it('labels the open pages', () => {
    expect(pagesLabel(0, 1)).toBe('Pages 1–2 of 2');
    expect(pagesLabel(1, 3)).toBe('Pages 3–4 of 6');
    expect(pagesLabel(0, 0)).toBe('Pages 1–2 of 2');
  });
});

describe('notebook motion', () => {
  it('riffles through at most four sheets, ending on the target', () => {
    expect(riffleSteps(0, 1)).toEqual([1]);
    expect(riffleSteps(0, 3)).toEqual([1, 2, 3]);
    expect(riffleSteps(0, 10)).toEqual([3, 5, 8, 10]);
    expect(riffleSteps(9, 1)).toEqual([7, 5, 3, 1]);
    expect(riffleSteps(2, 2)).toEqual([]);
  });

  it('turns a dragged sheet as far as the pointer travelled', () => {
    expect(dragProgress(0, 1000)).toBe(0);
    expect(dragProgress(500, 1000)).toBe(0.5);
    expect(dragProgress(1400, 1000)).toBe(1);
    expect(dragProgress(-20, 1000)).toBe(0);
    expect(dragProgress(50, 0)).toBe(0);
  });

  it('completes a released turn past a third, or when flicked', () => {
    expect(releaseCompletes(0.5, 0)).toBe(true);
    expect(releaseCompletes(0.2, 0)).toBe(false);
    expect(releaseCompletes(0.1, 1.2)).toBe(true);
    expect(releaseCompletes(0.8, -1.2)).toBe(false);
  });
});
