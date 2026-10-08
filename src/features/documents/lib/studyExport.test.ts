import { expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { studyPdf, overlayPlacement } from '@/features/documents/lib/studyExport';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
it('exports the exact source/note order, preserving cropped and rotated vector pages', async () => {
  const pdf = await PDFDocument.create();
  const first = pdf.addPage([842, 595]);
  first.drawText('Original');
  const second = pdf.addPage([600, 800]);
  second.setCropBox(10, 20, 500, 700);
  second.setRotation(degrees(90));
  const source = vi.fn(async () => pdf.save());
  const notes = vi.fn(() => Promise.resolve([png]));
  const attrs = { src: 'attachments/original.pdf', width: 842, height: 595, ink: '[]' };
  const bytes = await studyPdf(
    [
      { type: 'pdfPage', attrs: { ...attrs, page: 1 } },
      { type: 'studyPage', content: [{ type: 'paragraph' }] },
      {
        type: 'pdfPage',
        attrs: {
          ...attrs,
          page: 2,
          width: 700,
          height: 500,
          ink: JSON.stringify([
            {
              id: 'text',
              type: 'text',
              color: 'ink',
              text: 'ä😀',
              x: 1,
              y: 2,
              width: 90,
              fontSize: 16,
            },
          ]),
        },
      },
    ],
    source,
    notes,
    () => png,
  );
  const result = await PDFDocument.load(bytes);
  expect(result.getPageCount()).toBe(3);
  expect(result.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
  expect(result.getPage(1).getSize()).toEqual({ width: 595, height: 842 });
  expect(result.getPage(2).getCropBox()).toEqual(second.getCropBox());
  expect(result.getPage(2).getRotation().angle).toBe(90);
  expect(source).toHaveBeenCalledTimes(1);
  expect(notes).toHaveBeenCalledTimes(1);
});
it.each([0, 90, 180, 270])('maps the transparent annotation layer at %s degrees', (angle) => {
  const placement = overlayPlacement({ x: 10, y: 20, width: 500, height: 700 }, angle);
  expect(placement.x).toBe(10 + ([90, 180].includes(angle) ? 500 : 0));
  expect(placement.y).toBe(20 + ([180, 270].includes(angle) ? 700 : 0));
  expect(placement.width).toBe(angle % 180 ? 700 : 500);
  expect(placement.height).toBe(angle % 180 ? 500 : 700);
});
it('does not silently discard ordinary notes between PDF blocks or missing source pages', async () => {
  const notes = vi.fn(() => Promise.resolve([png]));
  await studyPdf(
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      { type: 'studyPage', content: [{ type: 'paragraph' }] },
    ],
    () => Promise.resolve(new Uint8Array()),
    notes,
  );
  expect(notes).toHaveBeenCalledTimes(2);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await expect(
    studyPdf(
      [
        {
          type: 'pdfPage',
          attrs: { src: 'attachments/a.pdf', page: 2, width: 595, height: 842, ink: '[]' },
        },
      ],
      () => pdf.save(),
      notes,
    ),
  ).rejects.toThrow('fehlt');
});

it('passes saved handwriting on inserted pages to the note renderer', async () => {
  const ink = [{ id: 'note', type: 'pen', color: 'green', width: 2, points: [{ x: 20, y: 30 }] }];
  const render = vi.fn(() => Promise.resolve([png]));
  await studyPdf(
    [
      { type: 'studyPage', attrs: { ink: JSON.stringify(ink) }, content: [{ type: 'paragraph' }] },
      { type: 'paragraph' },
    ],
    () => Promise.resolve(new Uint8Array()),
    render,
  );
  expect(render).toHaveBeenCalledWith([{ type: 'paragraph' }], ink);
  expect(render).toHaveBeenCalledTimes(1);
});
