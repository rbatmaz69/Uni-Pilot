import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentRequest, type DocumentEntry } from '@/features/documents/lib/files';
import { clearPreviewCache, loadExcerpt, loadNotePreview, loadPreview } from './previewCache';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));
const request = vi.mocked(documentRequest);
const slides: DocumentEntry = {
  name: 'Slides.pdf',
  path: 'Biology/Slides.pdf',
  folder: false,
  size: 3,
  modified: 1000,
};

beforeEach(() => {
  clearPreviewCache();
  request.mockReset();
  request.mockResolvedValue({ mime: 'application/pdf', base64: 'YWJj' });
});

describe('preview cache', () => {
  it('reads an unchanged file once, however often the canvas asks', async () => {
    const first = await loadPreview(slides);
    const second = await loadPreview({ ...slides });
    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reads the file again after it changed on disk', async () => {
    await loadPreview(slides);
    await loadPreview({ ...slides, modified: 2000 });
    await loadPreview({ ...slides, modified: 2000, size: 4 });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('forgets failed reads so the next request retries', async () => {
    request.mockRejectedValueOnce(new Error('busy'));
    await expect(loadPreview(slides)).rejects.toThrow('busy');
    await expect(loadPreview(slides)).resolves.toEqual({
      mime: 'application/pdf',
      base64: 'YWJj',
    });
  });

  it('keeps only the start of a note for its card', async () => {
    request.mockResolvedValueOnce('x'.repeat(2000));
    const notes = { ...slides, name: 'Notes.md', path: 'Notes.md' };
    expect(await loadExcerpt(notes)).toHaveLength(600);
    expect(request).toHaveBeenCalledWith({ action: 'read', path: 'Notes.md' });
  });

  it('keeps a complete embedded image that crosses the note preview limit', async () => {
    const base64 = 'YWJj'.repeat(17000);
    request.mockResolvedValueOnce(
      `Before\n\n![Screenshot](data:image/png;base64,${base64})\n\nAfter`,
    );
    const notes = { ...slides, name: 'Notes.md', path: 'Notes.md' };

    expect(await loadNotePreview(notes)).toBe(
      `Before\n\n![Screenshot](data:image/png;base64,${base64})`,
    );
  });
});
