import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentRequest, type DocumentEntry } from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { FolderArtwork } from './FolderArtwork';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));

beforeEach(() => {
  clearPreviewCache();
  vi.mocked(documentRequest).mockReset();
});

it('shows an embedded image on a folder paper instead of its base64 text', async () => {
  const folder: DocumentEntry = {
    name: 'Biology',
    path: 'Biology',
    folder: true,
    size: 0,
    modified: 1,
  };
  const note: DocumentEntry = {
    name: 'Lecture.md',
    path: 'Biology/Lecture.md',
    folder: false,
    size: 10000,
    modified: 1,
  };
  const base64 = 'YWJj'.repeat(2500);
  vi.mocked(documentRequest).mockImplementation((request) => {
    if (request.action === 'list') return Promise.resolve({ root: '', entries: [note] });
    if (request.action === 'read')
      return Promise.resolve(`![Screenshot](data:image/png;base64,${base64})`);
    return Promise.reject(new Error('Unexpected preview request'));
  });

  const { container } = render(<FolderArtwork entry={folder} enabled />);
  await waitFor(() =>
    expect(container.querySelector('.canvas-folder-peek img')).toHaveAttribute(
      'src',
      `data:image/png;base64,${base64}`,
    ),
  );
  expect(container.querySelector('.canvas-folder-peek')).not.toHaveTextContent(base64);
});
