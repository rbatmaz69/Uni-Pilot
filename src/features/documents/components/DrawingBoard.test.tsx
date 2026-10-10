import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentRequest } from '@/features/documents/lib/files';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { DrawingBoard } from './DrawingBoard';

// The real board needs a canvas; this one only reports that it is ready.
vi.mock('@excalidraw/excalidraw', async () => {
  const { useEffect } = await import('react');
  return {
    Excalidraw: ({ excalidrawAPI }: { excalidrawAPI: (api: object) => void }) => {
      useEffect(() => excalidrawAPI({}), [excalidrawAPI]);
      return <div>Drawing board</div>;
    },
    hashElementsVersion: () => 0,
    restore: vi.fn(),
    serializeAsJSON: () => '',
  };
});
vi.mock('@/features/documents/lib/files', () => ({ documentRequest: vi.fn() }));

beforeEach(() => {
  vi.mocked(documentRequest).mockRejectedValue(new Error('No drawing yet'));
  useNoteStyleStore.setState({ focus: false });
});

it('docks its tools at the bottom of the board: components to add, then focus mode', async () => {
  render(<DrawingBoard notePath="Biology/Cells.md" />);
  const dock = screen.getByRole('toolbar', { name: 'Canvas tools' });
  expect(within(dock).getAllByRole('button')).toHaveLength(4);
  const stickies = within(dock).getByRole('button', { name: 'Sticky notes' });
  expect(stickies).toBeDisabled();
  expect(screen.queryByText('Add to canvas')).not.toBeInTheDocument();

  await screen.findByText('Drawing board');
  await waitFor(() => expect(stickies).toBeEnabled());
  fireEvent.click(stickies);
  expect(screen.getByRole('dialog', { name: 'Sticky notes' })).toBeInTheDocument();

  const focus = within(dock).getByRole('button', { name: 'Focus mode' });
  fireEvent.click(focus);
  expect(useNoteStyleStore.getState().focus).toBe(true);
  expect(focus).toHaveAttribute('aria-pressed', 'true');
});
