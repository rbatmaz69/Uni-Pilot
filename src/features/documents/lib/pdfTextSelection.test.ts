import { expect, it, vi } from 'vitest';
import { selectionRects } from './pdfTextSelection';
import { drawAnnotations } from './pdfInk';
import { readInk } from './studyPages';
const rect = (x: number, y: number, w: number, h: number) => new DOMRect(x, y, w, h);
it('maps zoomed text runs to displayed page points and combines only adjacent runs on a line', () => {
  const result = selectionRects(
    [rect(30, 50, 40, 20), rect(72, 50, 30, 20), rect(30, 80, 50, 20), rect(200, 80, 30, 20)],
    rect(10, 20, 400, 600),
    200,
    300,
  );
  expect(result).toEqual([
    { x: 10, y: 15, width: 36, height: 10 },
    { x: 10, y: 30, width: 25, height: 10 },
    { x: 95, y: 30, width: 15, height: 10 },
  ]);
});
it('exports every highlighted line and rejects invalid saved rectangles', () => {
  const highlight = {
    id: 'hi',
    type: 'highlight' as const,
    color: 'yellow' as const,
    rects: [{ x: 5, y: 7, width: 30, height: 12 }],
  };
  const context = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() };
  drawAnnotations(context as unknown as CanvasRenderingContext2D, [highlight]);
  expect(context.fillRect).toHaveBeenCalledWith(5, 7, 30, 12);
  expect(readInk(JSON.stringify([highlight]))).toEqual([highlight]);
  expect(
    readInk(JSON.stringify([{ ...highlight, rects: [{ x: 0, y: 0, width: -10, height: 1 }] }])),
  ).toBeNull();
});
