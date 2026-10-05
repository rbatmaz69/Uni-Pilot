import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { SelectionMenu } from './SelectionMenu';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('table selection menu', () => {
  it('shows labeled table options and visible accent colors while editing a cell', async () => {
    editor = new Editor({ extensions: noteExtensions(), content: '' });
    render(
      <>
        <EditorContent editor={editor} />
        <SelectionMenu editor={editor} scrollTarget={null} />
      </>,
    );
    act(() => {
      editor?.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      editor?.commands.focus();
    });

    const options = await screen.findByRole('button', { name: 'Table options' });
    expect(screen.getByRole('button', { name: 'Quick blue table accent' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Quick blue table accent' }));
    expect(editor.getAttributes('table').tone).toBe('blue');

    fireEvent.click(options);
    expect(screen.getByRole('dialog', { name: 'Table options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Green cell fill' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Row above' })).toBeVisible();
  });

  it('shows text formatting for selected text inside a cell', async () => {
    editor = new Editor({
      extensions: noteExtensions(),
      content:
        '<table><tbody><tr><th>Dasdasdas</th><th></th></tr><tr><td></td><td></td></tr></tbody></table>',
    });
    render(
      <>
        <EditorContent editor={editor} />
        <SelectionMenu editor={editor} scrollTarget={null} />
      </>,
    );

    let textPosition = -1;
    editor.state.doc.descendants((node, position) => {
      if (textPosition === -1 && node.isText) textPosition = position;
    });
    expect(textPosition).toBeGreaterThan(0);

    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    });

    act(() => {
      editor?.commands.focus();
      editor?.commands.setTextSelection({ from: textPosition, to: textPosition + 5 });
    });

    expect(await screen.findByRole('button', { name: 'Bold' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Turn into, currently Text' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Table options' })).not.toBeInTheDocument();
  });
});
