import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function selectSentence() {
  editor = new Editor({
    extensions: noteExtensions(),
    content: '<p>Keep this sentence.</p><p>Next paragraph.</p>',
  });
  render(
    <>
      <EditorContent editor={editor} />
      <SelectionMenu editor={editor} scrollTarget={null} />
    </>,
  );
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
    bottom: 30,
    left: 30,
    right: 100,
    top: 10,
  });
  act(() => {
    editor?.commands.focus();
    editor?.commands.setTextSelection({ from: 1, to: 20 });
  });
}

it('keeps the selection while applying text and background colors from one palette', async () => {
  selectSentence();
  fireEvent.click(await screen.findByRole('button', { name: 'Text and background color' }));
  expect(await screen.findByRole('menu', { name: 'Text and background colors' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Color' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Background' })).toBeVisible();

  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Blue text color' }));
  expect(editor!.state.selection.from).toBe(1);
  expect(editor!.state.selection.to).toBe(20);
  expect(editor!.getMarkdown()).toContain('data-note-color="blue"');

  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Pink background' }));
  expect(editor!.getMarkdown()).toContain('data-note-highlight="pink"');
  expect(editor!.getMarkdown()).toContain('data-note-color="blue"');

  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default text color' }));
  expect(editor!.getMarkdown()).not.toContain('data-note-color="blue"');
  expect(editor!.getMarkdown()).toContain('data-note-highlight="pink"');
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default background' }));
  expect(editor!.getMarkdown()).not.toContain('data-note-highlight="pink"');

  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }));
  expect(editor!.getMarkdown()).toBe('Keep this sentence.\n\nNext paragraph.');
});

it('inserts a keyboard-sized table without replacing selected text and closes stale submenus', async () => {
  selectSentence();
  fireEvent.click(await screen.findByRole('button', { name: 'Insert table' }));
  const cell = screen.getByRole('gridcell', { name: '3 rows, 3 columns' });
  await waitFor(() => expect(cell).toHaveFocus());
  fireEvent.keyDown(cell, { key: 'ArrowUp' });
  const smaller = screen.getByRole('gridcell', { name: '2 rows, 3 columns' });
  expect(smaller).toHaveFocus();
  fireEvent.click(smaller);
  expect(editor!.getJSON().content?.map((n) => n.type)).toEqual([
    'paragraph',
    'table',
    'paragraph',
  ]);
  expect(editor!.state.doc.textContent).toBe('Keep this sentence.Next paragraph.');
  expect(editor!.getJSON().content?.[1]?.content).toHaveLength(2);
  act(() => {
    editor!.commands.setTextSelection({ from: 1, to: 5 });
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Text and background color' }));
  act(() => {
    editor!.commands.setTextSelection({ from: 6, to: 10 });
  });
  expect(await screen.findByRole('button', { name: 'Bold' })).toBeVisible();
  expect(screen.queryByRole('menuitemradio', { name: 'Blue text color' })).not.toBeInTheDocument();
});
