import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { TableTools } from './TableTools';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('table options', () => {
  it('styles a cell and table, changes their structure, and saves the result', () => {
    editor = new Editor({ extensions: noteExtensions(), content: '' });
    const { container } = render(
      <>
        <TableTools editor={editor} />
        <EditorContent editor={editor} />
      </>,
    );
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    expect(editor.isActive('table')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Striped table style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spacious' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blue table accent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yellow cell fill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Green cell text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Row below' }));

    expect(editor.getAttributes('table')).toMatchObject({
      variant: 'striped',
      density: 'spacious',
      tone: 'blue',
    });
    expect(editor.state.doc.firstChild?.childCount).toBe(3);
    expect(editor.getHTML()).toContain('data-note-cell-tone="yellow"');
    expect(editor.getHTML()).toContain('data-note-cell-ink="green"');
    expect(container.querySelector('table')).toHaveAttribute('data-note-table-variant', 'striped');
    expect(container.querySelector('table')).toHaveAttribute('data-note-table-tone', 'blue');
    expect(container.querySelector('th[data-note-cell-tone="yellow"]')).toBeInTheDocument();
    expect(editor.getMarkdown()).toContain('data-note-table-variant="striped"');
    expect(screen.getByRole('button', { name: 'Striped table style' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
