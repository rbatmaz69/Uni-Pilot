import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PdfInkLayer } from './PdfInkLayer';
import type { Annotation, Tool } from '@/features/documents/lib/pdfInkTypes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function drawing(tool: Tool, annotations: Annotation[] = []) {
  vi.stubGlobal('PointerEvent', undefined);
  // A quick gesture may finish before the next animation frame paints its preview.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 99),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const onChange = vi.fn();
  render(
    <PdfInkLayer
      page={{
        id: 'sheet',
        kind: 'note',
        paper: 'blank',
        sourceIndex: null,
        width: 100,
        height: 100,
        annotations,
      }}
      tool={tool}
      color="blue"
      penWidth={2}
      textSize={16}
      selected={null}
      onSelect={vi.fn()}
      onText={vi.fn()}
      onChange={onChange}
    />,
  );
  const layer = screen.getByRole('img');
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
  return { layer, onChange };
}
it('saves the final pointer position even when a stroke ends before the preview paints', () => {
  const { layer, onChange } = drawing('pen');
  fireEvent.mouseDown(layer, { button: 0, clientX: 10, clientY: 20 });
  fireEvent.mouseMove(layer, { clientX: 30, clientY: 40 });
  fireEvent.mouseUp(layer, { clientX: 50, clientY: 60 });
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ],
    }),
  ]);
});
it('moves an existing annotation to the release position rather than a stale preview', () => {
  const original: Annotation = {
    id: 'ink',
    type: 'pen',
    color: 'blue',
    width: 2,
    points: [
      { x: 10, y: 20 },
      { x: 20, y: 30 },
    ],
  };
  const { layer, onChange } = drawing('select', [original]);
  fireEvent.mouseDown(layer.querySelector('[data-annotation]')!, {
    button: 0,
    clientX: 10,
    clientY: 20,
  });
  fireEvent.mouseMove(layer, { clientX: 20, clientY: 30 });
  fireEvent.mouseUp(layer, { clientX: 40, clientY: 50 });
  expect(onChange).toHaveBeenCalledWith([
    {
      ...original,
      points: [
        { x: 40, y: 50 },
        { x: 50, y: 60 },
      ],
    },
  ]);
  expect(original.points).toEqual([
    { x: 10, y: 20 },
    { x: 20, y: 30 },
  ]);
});
