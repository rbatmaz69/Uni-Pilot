import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { documentRequest, uploadDocument, type DocumentEntry } from './files';
import { runDocumentTool } from './documentTools';

vi.mock('./files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
  uploadDocument: vi.fn(),
}));

const request = vi.mocked(documentRequest);
const upload = vi.mocked(uploadDocument);
const first: DocumentEntry = {
  name: 'Lecture.pdf',
  path: 'Physics/Lecture.pdf',
  folder: false,
  size: 0,
  modified: 0,
};
const second: DocumentEntry = { ...first, name: 'Notes.pdf', path: 'Physics/Notes.pdf' };

async function onePagePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return new Uint8Array(await pdf.save());
}

describe('PDF file tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines two PDFs into a new file without overwriting either source', async () => {
    const bytes = await onePagePdf();
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    request.mockImplementation((action) => {
      if (action.action === 'preview') return Promise.resolve({ mime: 'application/pdf', base64 });
      if (action.action === 'list')
        return Promise.resolve({ root: '/student', entries: [first, second] });
      return Promise.resolve();
    });
    upload.mockResolvedValue(undefined);

    const result = await runDocumentTool(first, 'merge-pdf', { other: second });
    expect(result.name).toBe('Lecture (combined).pdf');
    const [destination, output] = upload.mock.calls[0]!;
    expect(destination).toEqual({ kind: 'import', path: 'Physics', name: result.name });
    expect((await PDFDocument.load(output)).getPageCount()).toBe(2);
    expect(request).toHaveBeenCalledWith({ action: 'preview', path: first.path });
    expect(request).toHaveBeenCalledWith({ action: 'preview', path: second.path });
  });

  it('extracts the requested pages into a new PDF', async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    source.addPage([612, 792]);
    const bytes = new Uint8Array(await source.save());
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    request.mockImplementation((action) => {
      if (action.action === 'preview') return Promise.resolve({ mime: 'application/pdf', base64 });
      if (action.action === 'list') return Promise.resolve({ root: '/student', entries: [first] });
      return Promise.resolve();
    });
    upload.mockResolvedValue(undefined);

    await runDocumentTool(first, 'extract-pages', { pages: '2' });
    const output = upload.mock.calls[0]![1];
    const extracted = await PDFDocument.load(output);
    expect(extracted.getPageCount()).toBe(1);
    expect(extracted.getPage(0).getWidth()).toBe(612);
  });

  it('reorders every page and splits a PDF into two new files', async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    source.addPage([612, 792]);
    source.addPage([420, 595]);
    const bytes = new Uint8Array(await source.save());
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    request.mockImplementation((action) => {
      if (action.action === 'preview') return Promise.resolve({ mime: 'application/pdf', base64 });
      if (action.action === 'list') return Promise.resolve({ root: '/student', entries: [first] });
      return Promise.resolve();
    });
    upload.mockResolvedValue(undefined);

    await runDocumentTool(first, 'reorder-pdf', { pages: '3, 1-2' });
    const reordered = await PDFDocument.load(upload.mock.calls[0]![1]);
    expect(reordered.getPage(0).getWidth()).toBe(420);
    expect(reordered.getPage(1).getWidth()).toBe(595);
    upload.mockClear();

    const result = await runDocumentTool(first, 'split-pdf', { pages: '1' });
    expect(result.names).toEqual(['Lecture (pages 1-1).pdf', 'Lecture (pages 2-3).pdf']);
    expect((await PDFDocument.load(upload.mock.calls[0]![1])).getPageCount()).toBe(1);
    expect((await PDFDocument.load(upload.mock.calls[1]![1])).getPageCount()).toBe(2);
  });
});
