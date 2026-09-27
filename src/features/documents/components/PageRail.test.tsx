import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { noteStats } from '@/features/documents/lib/noteOutline';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { PageRail } from './PageRail';

let editor: Editor;
beforeEach(() => {
  useNoteStyleStore.setState({
    style: 'standard',
    layout: 'card',
    tone: 'default',
    cover: 'none',
    focus: false,
  });
});
afterEach(() => editor?.destroy());
function open(content = 'Keep my notes', disabled = false) {
  editor = new Editor({ extensions: noteExtensions(), content, contentType: 'markdown' });
  const onImage = vi.fn();
  render(
    <>
      <PageRail
        editor={editor}
        disabled={disabled}
        onInsertImage={onImage}
        onOpenCanvas={vi.fn()}
        readStats={() => noteStats(editor.state.doc)}
        fileName="Study.md"
        keepsProperties={false}
      />
      <EditorContent editor={editor} />
    </>,
  );
  return { onImage };
}
function insertPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Insert block' }));
  return screen.getByRole('dialog', { name: 'Insert content' });
}

describe('notes tool rail', () => {
  it('opens one panel at a time and restores the trigger on Escape', () => {
    open();
    insertPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Format text' }));
    expect(screen.queryByRole('dialog', { name: 'Insert content' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Format text' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Format text' })).toHaveFocus();
  });

  it('inserts after the current block without overwriting selected text, and can undo', () => {
    open();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });
    const panel = insertPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Checklist' }));
    expect(editor.state.doc.child(0).textContent).toBe('Keep my notes');
    expect(editor.state.doc.child(1).type.name).toBe('taskList');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.isActive('taskList')).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getMarkdown()).toBe('Keep my notes');
  });

  it('inserts a table with the cursor in a cell and retains it on a Markdown round trip', () => {
    open('');
    fireEvent.click(within(insertPanel()).getByRole('button', { name: 'Table' }));
    expect(editor.isActive('table')).toBe(true);
    expect(editor.state.doc.child(0).childCount).toBe(3);
    act(() => {
      editor.commands.insertContent('Topic');
    });
    const markdown = editor.getMarkdown();
    act(() => {
      editor.commands.setContent(markdown, { contentType: 'markdown' });
    });
    expect(editor.state.doc.child(0).type.name).toBe('table');
    expect(editor.state.doc.child(0).textContent).toContain('Topic');
  });

  it('filters templates and offers a useful empty result', () => {
    open();
    const panel = insertPanel();
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search blocks' }), {
      target: { value: 'Cornell' },
    });
    expect(within(panel).getByRole('button', { name: 'Cornell notes' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('searchbox'), { target: { value: 'unknown block' } });
    expect(within(panel).getByText('No blocks found. Try “table” or “study”.')).toBeInTheDocument();
  });

  it('preserves selected text when formatting and supports undo from the panel', () => {
    open('Study');
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Format text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(editor.getMarkdown()).toBe('**Study**');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(editor.getMarkdown()).toBe('Study');
  });

  it('disables inserts and formatting while a note is protected', () => {
    open('Study', true);
    expect(within(insertPanel()).getByRole('button', { name: 'Table' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mint sticky note' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Format text' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  });

  it('remembers appearance choices without modifying note content', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Page style' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ivory' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sage' }));
    expect(useNoteStyleStore.getState()).toMatchObject({ tone: 'warm', cover: 'sage' });
    expect(editor.getMarkdown()).toBe('Keep my notes');
    expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
      state: { tone: 'warm', cover: 'sage' },
    });
  });

  it('previews and remembers bold colors while preserving bold and highlighted Markdown', () => {
    const content = 'Context with **bold insight** and ==highlighted essential==.';
    open(content);
    fireEvent.click(screen.getByRole('button', { name: 'Page style' }));
    const colors = screen.getByRole('radiogroup', { name: 'Bold text color' });
    expect(within(colors).getByRole('radio', { name: 'Default' })).toBeChecked();
    for (const label of ['Blue', 'Teal', 'Rose', 'Default']) {
      fireEvent.click(within(colors).getByRole('radio', { name: label }));
      expect(within(colors).getByRole('radio', { name: label })).toBeChecked();
      expect(document.querySelector('.note-style-preview')).toHaveAttribute(
        'data-bold-color',
        label.toLowerCase(),
      );
      expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
        state: { boldColor: label.toLowerCase() },
      });
      expect(editor.getMarkdown()).toBe(content);
    }
  });

  it('keeps bold color controls available in the notebook and supports arrow keys', () => {
    useNoteStyleStore.setState({ style: 'notebook', boldColor: 'teal', tone: 'contrast' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Page style' }));
    const colors = screen.getByRole('radiogroup', { name: 'Bold text color' });
    const teal = within(colors).getByRole('radio', { name: 'Teal' });
    expect(teal).toBeChecked();
    teal.focus();
    fireEvent.keyDown(teal, { key: 'ArrowRight' });
    expect(within(colors).getByRole('radio', { name: 'Rose' })).toBeChecked();
    expect(within(colors).getByRole('radio', { name: 'Rose' })).toHaveFocus();
    expect(document.querySelector('.note-style-preview')).toHaveAttribute(
      'data-layout',
      'notebook',
    );
    expect(document.querySelector('.note-style-preview')).toHaveAttribute('data-tone', 'default');
  });
});
