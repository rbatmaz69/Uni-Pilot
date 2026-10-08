import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  documentRequest,
  uploadDocument,
  type DocumentEntry,
} from '@/features/documents/lib/files';
import { openStudyDocument, studySource } from '@/features/documents/lib/studyImport';
vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
  uploadDocument: vi.fn(),
}));
const request = vi.mocked(documentRequest);
const upload = vi.mocked(uploadDocument);
const entry: DocumentEntry = {
  name: 'Vorlesung.pdf',
  path: 'ILIAS/Vorlesung.pdf',
  folder: false,
  size: 500,
  modified: 1,
  ilias: 'file',
};
beforeEach(() => {
  vi.clearAllMocks();
});
it('snapshots all original pages and saves an editable companion without writing to the ILIAS file', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([842, 595]);
  pdf.addPage([595, 842]);
  const bytes = await pdf.save();
  request.mockImplementation((action) => {
    if (action.action === 'list') return Promise.resolve({ root: '', entries: [] });
    if (action.action === 'preview')
      return Promise.resolve({
        mime: 'application/pdf',
        base64: btoa(String.fromCharCode(...bytes)),
      });
    if (action.action === 'save') return Promise.resolve({ status: 'saved' });
    return Promise.resolve();
  });
  upload.mockResolvedValue({ src: 'attachments/original.pdf' });
  const opened = await openStudyDocument(entry);
  expect(opened.entry.path).toBe('ILIAS/Vorlesung.pdf (Aufschriebe).md');
  expect(studySource(opened.content)).toBe(entry.path);
  expect(opened.content.match(/:::pdfPage/g)).toHaveLength(2);
  expect(opened.content).toContain('"width":842,"height":595');
  expect(upload).toHaveBeenCalledWith(
    { kind: 'attachment', note: opened.entry.path, name: 'original.pdf' },
    expect.any(Uint8Array),
  );
  expect(
    request.mock.calls
      .filter(([a]) => a.action === 'save')
      .every(([a]) => 'path' in a && a.path === opened.entry.path),
  ).toBe(true);
});
it('reopens existing notes after an ILIAS update and never replaces the saved snapshot', async () => {
  const companion = {
    ...entry,
    name: 'Vorlesung.pdf (Aufschriebe) 2.md',
    path: 'ILIAS/Vorlesung.pdf (Aufschriebe) 2.md',
  };
  const content = `---\nuni-pilot-source: ${JSON.stringify(entry.path)}\n---\n\nMeine Lösung`;
  request.mockImplementation((action) =>
    Promise.resolve(action.action === 'list' ? { root: '', entries: [companion] } : content),
  );
  expect(await openStudyDocument({ ...entry, modified: 999 })).toEqual({
    entry: companion,
    content,
  });
  expect(upload).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'preview' }));
});
it('keeps a conflicting file and removes a failed empty import from the live folder', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  request.mockImplementation((action) =>
    Promise.resolve(
      action.action === 'list'
        ? { root: '', entries: [{ ...entry, name: 'Vorlesung.pdf (Aufschriebe).md' }] }
        : action.action === 'read'
          ? action.path.endsWith(' 2.md')
            ? ''
            : 'Eine andere Notiz'
          : action.action === 'preview'
            ? { mime: 'application/pdf', base64: btoa(String.fromCharCode(...bytes)) }
            : undefined,
    ),
  );
  upload.mockRejectedValue(new Error('Disk full'));
  await expect(openStudyDocument(entry)).rejects.toThrow('Disk full');
  expect(request).toHaveBeenCalledWith({
    action: 'create',
    path: 'ILIAS',
    name: 'Vorlesung.pdf (Aufschriebe) 2.md',
    folder: false,
  });
  expect(request).toHaveBeenCalledWith({
    action: 'trash',
    path: 'ILIAS/Vorlesung.pdf (Aufschriebe) 2.md',
  });
});
