import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockAt } from '@/features/documents/lib/blockActions';
import { composeNote, noteExtensions } from '@/features/documents/lib/markdown';
import { BlockMenu } from './BlockHandle';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string, text: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: noteExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isTextblock && node.textContent === text) at = pos + 1;
  });
  const onClose = vi.fn();
  render(
    <BlockMenu
      editor={editor}
      block={blockAt(editor.state.doc, at)!}
      anchor={null}
      onClose={onClose}
    />,
  );
  return { current: editor, onClose };
}
const saved = (current: Editor) => composeNote('', current.getMarkdown());
const item = (name: string) => screen.getByRole('menuitem', { name: new RegExp(`^${name}`) });

describe('block options', () => {
  it('moves the block it was opened for and closes', () => {
    const { current, onClose } = open('A\n\nB\n', 'B');
    fireEvent.click(item('Move up'));
    expect(saved(current)).toBe('B\n\nA\n');
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('offers only the moves that are possible', () => {
    open('A\n\nB\n', 'A');
    expect(item('Move up')).toBeDisabled();
    expect(item('Move down')).toBeEnabled();
  });

  it('duplicates the block below itself', () => {
    const { current } = open('A\n\nB\n', 'A');
    fireEvent.click(item('Duplicate'));
    expect(saved(current)).toBe('A\n\nA\n\nB\n');
  });

  it('deletes the block', () => {
    const { current } = open('A\n\nB\n', 'A');
    fireEvent.click(item('Delete'));
    expect(saved(current)).toBe('B\n');
  });

  it('turns the block into another kind and marks the current one', () => {
    const { current } = open('Intro\n\nPlain\n', 'Plain');
    expect(screen.getByRole('menuitemradio', { name: 'Text' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Heading 2' }));
    expect(saved(current)).toBe('Intro\n\n## Plain\n');
  });

  it('marks a list item with the kind of its list', () => {
    open('- one\n- two\n', 'two');
    expect(screen.getByRole('menuitemradio', { name: 'Bulleted list' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('offers no “turn into” for a formula', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: noteExtensions(),
      content: '$$\nx\n$$\n',
      contentType: 'markdown',
    });
    render(
      <BlockMenu
        editor={editor}
        block={blockAt(editor.state.doc, 0)!}
        anchor={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('is operated with the arrow keys and closed with Escape', async () => {
    const { onClose } = open('A\n\nB\n', 'A');
    await act(async () => {
      await Promise.resolve();
    });
    expect(item('Duplicate')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    // Move up is disabled for the first block, so the focus skips it.
    expect(item('Move down')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(item('Duplicate')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
