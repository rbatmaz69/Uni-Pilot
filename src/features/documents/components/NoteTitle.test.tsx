import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { NoteTitle } from './NoteTitle';

// jsdom lays nothing out; the title reports as many lines as the test says it wraps to.
let lines = 1;
beforeEach(() => {
  lines = 1;
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => lines * 48,
  });
});
afterEach(() => {
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
});

describe('note title', () => {
  it('fits its lines again when another face or size wraps it differently', () => {
    render(
      <NoteTitle
        title="Linear algebra"
        fileName="Linear algebra.md"
        disabled={false}
        onRename={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveStyle({ height: '48px' });

    lines = 2;
    act(() => useNoteStyleStore.getState().setFont('literata'));
    expect(title).toHaveStyle({ height: '96px' });

    lines = 3;
    act(() => useNoteStyleStore.getState().setTextSize('xl'));
    expect(title).toHaveStyle({ height: '144px' });
  });
});
