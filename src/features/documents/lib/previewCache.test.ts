import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  documentRequest,
  keepThumbnail,
  readKeptThumbnail,
  type DocumentEntry,
} from '@/features/documents/lib/files';
import { renderThumbnail } from '@/features/documents/lib/thumbnail';
import { clearPreviewCache, loadExcerpt, loadNotePreview, loadThumbnail } from './previewCache';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
  readKeptThumbnail: vi.fn(),
  keepThumbnail: vi.fn(),
}));
vi.mock('@/features/documents/lib/thumbnail', () => ({ renderThumbnail: vi.fn() }));
const request = vi.mocked(documentRequest);
const readKept = vi.mocked(readKeptThumbnail);
const keep = vi.mocked(keepThumbnail);
const render = vi.mocked(renderThumbnail);
const slides: DocumentEntry = {
  name: 'Slides.pdf',
  path: 'Biology/Slides.pdf',
  folder: false,
  size: 3,
  modified: 1000,
};
const pdf = { mime: 'application/pdf', base64: 'YWJj' };
const page = { mime: 'image/webp', base64: 'UklGRg==' };

beforeEach(() => {
  clearPreviewCache();
  for (const mock of [request, readKept, keep, render]) mock.mockReset();
  request.mockResolvedValue(pdf);
  readKept.mockResolvedValue(null);
  keep.mockResolvedValue();
  render.mockResolvedValue(page);
});

describe('preview cache', () => {
  it('shows a kept first page without reading the file', async () => {
    readKept.mockResolvedValue(page);
    expect(await loadThumbnail(slides)).toEqual(page);
    expect(readKept).toHaveBeenCalledWith(slides);
    expect(request).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('draws a first page once, keeps it, and reuses it however often the canvas asks', async () => {
    const first = await loadThumbnail(slides);
    const second = await loadThumbnail({ ...slides });
    expect(first).toEqual(page);
    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(pdf);
    expect(keep).toHaveBeenCalledWith(slides, page.base64);
  });

  it('draws again after the file changed on disk', async () => {
    await loadThumbnail(slides);
    await loadThumbnail({ ...slides, modified: 2000 });
    await loadThumbnail({ ...slides, modified: 2000, size: 4 });
    expect(readKept).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('shows the file itself when the page cannot be drawn, and keeps nothing', async () => {
    render.mockResolvedValue(null);
    expect(await loadThumbnail(slides)).toEqual(pdf);
    render.mockRejectedValue(new Error('no canvas'));
    expect(await loadThumbnail({ ...slides, modified: 2000 })).toEqual(pdf);
    expect(keep).not.toHaveBeenCalled();
  });

  it('draws anyway when the kept images cannot be reached or kept', async () => {
    readKept.mockRejectedValue(new Error('no desktop'));
    keep.mockRejectedValue(new Error('disk full'));
    expect(await loadThumbnail(slides)).toEqual(page);
  });

  it('forgets failed reads so the next request retries', async () => {
    request.mockRejectedValueOnce(new Error('busy'));
    await expect(loadThumbnail(slides)).rejects.toThrow('busy');
    await expect(loadThumbnail(slides)).resolves.toEqual(page);
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
