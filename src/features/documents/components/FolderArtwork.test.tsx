import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentRequest, type DocumentEntry } from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { FolderArtwork } from './FolderArtwork';
import { FolderIcon } from './FolderIcon';
import { useFolderAppearanceStore } from '../store/folderAppearanceStore';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));

beforeEach(() => {
  clearPreviewCache();
  vi.mocked(documentRequest).mockReset();
  useFolderAppearanceStore.setState({ appearances: {} });
});

it.each([
  ['Courses', '#c9dcbd'],
  ['Prizren2027', '#ecc4a7'],
  ['Logik und Künstliche Intelligenz', '#d5c8e7'],
])('uses the canvas color for %s in both views and shares changes immediately', (name, color) => {
  const entry: DocumentEntry = { name, path: name, folder: true, size: 0, modified: 0 };
  const { container } = render(
    <>
      <FolderIcon path={entry.path} />
      <FolderArtwork entry={entry} enabled={false} />
    </>,
  );
  const assertColor = (expected: string) => {
    expect(container.querySelector('.folder-glyph')).toHaveAttribute('data-folder-color', expected);
    expect(
      (container.querySelector('.canvas-folder-art') as HTMLElement).style.getPropertyValue(
        '--card-tone',
      ),
    ).toBe(expected);
  };
  assertColor(color);
  act(() => useFolderAppearanceStore.getState().setAppearance(entry.path, { color: '#d9b34b' }));
  assertColor('#d9b34b');
  act(() => useFolderAppearanceStore.getState().reset(entry.path));
  assertColor(color);
  expect(documentRequest).not.toHaveBeenCalled();
});

it('shares a course appearance with its sidebar even when its preview is in a different folder', () => {
  const path = ':ilias-course/42';
  const entry: DocumentEntry = {
    name: 'Courses',
    path: 'Courses/ILIAS',
    folder: true,
    size: 0,
    modified: 0,
  };
  const { container } = render(
    <>
      <FolderIcon path={path} name={entry.name} />
      <FolderArtwork entry={entry} enabled={false} appearancePath={path} />
    </>,
  );
  act(() => useFolderAppearanceStore.getState().setAppearance(path, { color: '#123abc' }));
  expect(container.querySelector('.folder-glyph')).toHaveAttribute('data-folder-color', '#123abc');
  expect(
    (container.querySelector('.canvas-folder-art') as HTMLElement).style.getPropertyValue(
      '--card-tone',
    ),
  ).toBe('#123abc');
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
