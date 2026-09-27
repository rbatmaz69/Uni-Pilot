import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentRequest } from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { NoteVisualPreview } from './NoteVisualPreview';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));

beforeEach(() => {
  clearPreviewCache();
  vi.mocked(documentRequest).mockReset();
  vi.mocked(documentRequest).mockResolvedValue({ mime: 'image/png', base64: 'YWJj' });
});

it('renders the note as a page with formatted blocks, a table, and its attached image', async () => {
  const { container } = render(
    <NoteVisualPreview
      name="Untitled.md"
      path="Biology/Untitled.md"
      content={
        '- [ ] [Test](https://example.com)\n\nEwer\n\n## Titel1\n\n| Image | Notes |\n| --- | --- |\n| ![Diagram](attachments/diagram.png) | **Important** |'
      }
    />,
  );

  expect(container.querySelector('.note-visual-title')).toHaveTextContent('Untitled');
  expect(container.querySelector('.note-visual-task .note-visual-checkbox')).toBeInTheDocument();
  expect(container.querySelector('h2')).toHaveTextContent('Titel1');
  expect(container.querySelectorAll('table th')).toHaveLength(2);
  expect(container.querySelector('table strong')).toHaveTextContent('Important');
  await waitFor(() =>
    expect(container.querySelector('table img')).toHaveAttribute(
      'src',
      'data:image/png;base64,YWJj',
    ),
  );
  expect(documentRequest).toHaveBeenCalledWith({
    action: 'preview',
    path: 'Biology/attachments/diagram.png',
  });
});

it('bounds long previews and does not load attachments past the visible first page', () => {
  const body = Array.from(
    { length: 200 },
    (_, index) => `Paragraph ${index} with **formatted words**.`,
  ).join('\n\n');
  const { container } = render(
    <NoteVisualPreview
      name="Long.md"
      path="Long.md"
      content={`${body}\n\n![Offscreen](attachments/late.png)`}
    />,
  );
  expect(container.querySelector('.note-visual-body')).toHaveTextContent('Paragraph 0');
  expect(container.querySelectorAll('.note-visual-body *').length).toBeLessThan(120);
  expect(documentRequest).not.toHaveBeenCalled();
});

it('updates the bold color of existing previews without losing combined emphasis', () => {
  const { container } = render(
    <NoteVisualPreview name="Study.md" path="Study.md" content="**==Key insight==**" />,
  );
  expect(container.querySelector('.note-visual-preview')).toHaveAttribute(
    'data-bold-color',
    'default',
  );
  act(() => useNoteStyleStore.getState().setBoldColor('teal'));
  expect(container.querySelector('.note-visual-preview')).toHaveAttribute(
    'data-bold-color',
    'teal',
  );
  expect(container.querySelector('strong mark')).toHaveTextContent('Key insight');
});

it('renders an embedded image whose data URL crosses the preview text limit', () => {
  const base64 = 'YWJj'.repeat(2500);
  const { container } = render(
    <NoteVisualPreview
      name="Embedded.md"
      path="Embedded.md"
      content={`Before\n\n![Screenshot](data:image/png;base64,${base64})\n\nAfter`}
    />,
  );

  expect(container.querySelector('.note-visual-body img')).toHaveAttribute(
    'src',
    `data:image/png;base64,${base64}`,
  );
  expect(container.querySelector('.note-visual-body')).not.toHaveTextContent(base64);
  expect(documentRequest).not.toHaveBeenCalled();
});
