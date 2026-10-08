import type { Annotation } from '@/features/documents/lib/pdfInkTypes';
import { Editor, generateHTML, type JSONContent } from '@tiptap/core';
import { degrees, PDFDocument } from 'pdf-lib';
import { toCanvas } from 'html-to-image';
import { noteExtensions, splitFrontMatter } from '@/features/documents/lib/markdown';
import { loadAttachment } from '@/features/documents/lib/previewCache';
import { resolveNoteLink } from '@/features/documents/lib/attachments';
import { decodePreview } from '@/features/documents/lib/studyImport';
import { annotationImage, drawAnnotations } from '@/features/documents/lib/pdfInk';
import { pdfPageAttributes, readInk } from '@/features/documents/lib/studyPages';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';

export function overlayPlacement(
  crop: { x: number; y: number; width: number; height: number },
  rotation: number,
) {
  const angle = ((rotation % 360) + 360) % 360;
  const swapped = angle === 90 || angle === 270;
  return {
    x: crop.x + (angle === 90 || angle === 180 ? crop.width : 0),
    y: crop.y + (angle === 180 || angle === 270 ? crop.height : 0),
    width: swapped ? crop.height : crop.width,
    height: swapped ? crop.width : crop.height,
    rotate: degrees(angle),
  };
}

/** Source pages remain vector PDFs; only the handwriting is a transparent overlay. */
export async function studyPdf(
  nodes: JSONContent[],
  sourceBytes: (src: string) => Promise<Uint8Array>,
  renderNotes: (content: JSONContent[], ink?: Annotation[]) => Promise<string[]>,
  renderInk = annotationImage,
): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  output.setCreator('Uni Pilot');
  const sources = new Map<string, Promise<PDFDocument>>();
  let pending: JSONContent[] = [];
  const addNotes = async (content: JSONContent[], ink?: Annotation[]) => {
    for (const image of await renderNotes(content, ink)) {
      const png = await output.embedPng(image);
      output.addPage([595, 842]).drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
      if (output.getPageCount() > 1500) throw new Error('Bitte höchstens 1500 Seiten exportieren.');
    }
  };
  // Tiptap keeps a trailing empty paragraph so typing after an atom is possible.
  // It is an editing cursor, not an extra blank PDF page.
  const printable = [...nodes];
  while (printable.at(-1)?.type === 'paragraph' && !printable.at(-1)?.content?.length)
    printable.pop();
  for (const node of printable) {
    if (node.type !== 'pdfPage' && node.type !== 'studyPage') {
      pending.push(node);
      continue;
    }
    if (pending.length) {
      await addNotes(pending);
      pending = [];
    }
    if (node.type === 'studyPage') {
      const ink = readInk(node.attrs?.ink ?? '[]');
      if (!ink) throw new Error('Die Markierungen einer Notizseite sind ungültig.');
      await addNotes(node.content ?? [{ type: 'paragraph' }], ink);
      continue;
    }
    const attrs = pdfPageAttributes(node.attrs ?? {});
    if (!attrs) throw new Error('Eine PDF-Seite enthält ungültige Daten.');
    if (!sources.has(attrs.src))
      sources.set(
        attrs.src,
        sourceBytes(attrs.src).then((bytes) => PDFDocument.load(bytes)),
      );
    const original = await sources.get(attrs.src)!;
    if (attrs.page > original.getPageCount())
      throw new Error('Eine Originalseite fehlt in der PDF-Kopie.');
    const [page] = await output.copyPages(original, [attrs.page - 1]);
    if (!page) throw new Error('Originalseite konnte nicht exportiert werden.');
    output.addPage(page);
    const annotations = readInk(attrs.ink)!;
    if (annotations.length) {
      const png = await output.embedPng(
        renderInk({
          id: `${attrs.src}-${attrs.page}`,
          kind: 'source',
          sourceIndex: attrs.page - 1,
          width: attrs.width,
          height: attrs.height,
          annotations,
          paper: 'blank',
        }),
      );
      page.drawImage(png, overlayPlacement(page.getCropBox(), page.getRotation().angle));
    }
    if (output.getPageCount() > 1500) throw new Error('Bitte höchstens 1500 Seiten exportieren.');
  }
  if (pending.length) await addNotes(pending);
  if (!output.getPageCount()) throw new Error('Das Dokument hat keine Seiten.');
  return output.save();
}

/** Render with the editor's bundled fonts, formulas, tables and pasted images. */
async function notePageImages(
  content: JSONContent[],
  notePath: string,
  ink: Annotation[] = [],
): Promise<string[]> {
  const host = document.createElement('div');
  host.className = 'note-workspace study-export-host';
  const settings = useNoteStyleStore.getState();
  for (const key of ['font', 'textSize', 'lineSpacing', 'tone', 'boldColor'] as const) {
    const attr = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    host.setAttribute(`data-${attr}`, settings[key]);
  }
  const sheet = document.createElement('section');
  sheet.className = 'study-note-sheet';
  const body = document.createElement('div');
  body.className = 'tiptap study-note-body';
  body.innerHTML = generateHTML({ type: 'doc', content }, noteExtensions());
  sheet.append(body);
  host.append(sheet);
  document.body.append(host);
  try {
    await Promise.all(
      Array.from(body.querySelectorAll('img')).map(async (image) => {
        const src = image.getAttribute('src') ?? '';
        const path = resolveNoteLink(notePath, src);
        if (path) {
          const data = await loadAttachment(path);
          image.src = `data:${data.mime};base64,${data.base64}`;
        }
        await image.decode();
      }),
    );
    await document.fonts?.ready;
    const canvas = await toCanvas(sheet, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(sheet).backgroundColor,
    });
    if (ink.length) {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Der PDF-Export ist auf diesem Gerät nicht verfügbar.');
      context.save();
      context.scale(canvas.width / 595, canvas.width / 595);
      drawAnnotations(context, ink);
      context.restore();
    }
    const results: string[] = [];
    const pageHeight = Math.round((canvas.width * 842) / 595);
    for (let y = 0; y < canvas.height; y += pageHeight) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = pageHeight;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Der PDF-Export ist auf diesem Gerät nicht verfügbar.');
      context.fillStyle = getComputedStyle(sheet).backgroundColor;
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        y,
        canvas.width,
        Math.min(pageHeight, canvas.height - y),
        0,
        0,
        canvas.width,
        Math.min(pageHeight, canvas.height - y),
      );
      results.push(slice.toDataURL('image/png'));
    }
    return results;
  } finally {
    host.remove();
  }
}

export async function exportStudyMarkdown(content: string, notePath: string): Promise<Uint8Array> {
  const editor = new Editor({
    extensions: noteExtensions(),
    content: splitFrontMatter(content).body,
    contentType: 'markdown',
  });
  try {
    return await studyPdf(
      editor.getJSON().content ?? [],
      async (src) => {
        const path = resolveNoteLink(notePath, src);
        if (!path) throw new Error('Die PDF-Kopie wurde nicht gefunden.');
        return decodePreview(await loadAttachment(path));
      },
      (nodes, ink) => notePageImages(nodes, notePath, ink),
    );
  } finally {
    editor.destroy();
  }
}
