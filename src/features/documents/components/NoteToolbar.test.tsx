import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from '@/features/documents/lib/markdown';
import { NoteToolbar } from './NoteToolbar';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(content = 'Study', disabled = false) {
  editor = new Editor({ extensions: noteExtensions(), content, contentType: 'markdown' });
  render(
    <>
      <NoteToolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
    </>,
  );
  return editor;
}

describe('note formatting toolbar', () => {
  it('uses the shared block choices and saves the selected style as Markdown', () => {
    const current = open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Block style' }), {
      target: { value: 'heading2' },
    });
    expect(composeNote('', current.getMarkdown())).toBe('## Study\n');
    expect(screen.getByRole('combobox', { name: 'Block style' })).toHaveValue('heading2');
  });

  it('formats selected text and lets the user undo it', () => {
    const current = open();
    current.commands.setTextSelection({ from: 1, to: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(current.getMarkdown()).toBe('**Study**');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current.getMarkdown()).toBe('Study');
  });

  it('keeps block conversion unavailable across multiple paragraphs', () => {
    const current = open('First\n\nSecond');
    act(() => {
      current.commands.setTextSelection({ from: 1, to: current.state.doc.content.size - 1 });
    });
    expect(screen.getByRole('combobox', { name: 'Block style' })).toBeDisabled();
  });

  it('opens the existing block menu through its insert command', () => {
    const current = open();
    fireEvent.click(screen.getByRole('button', { name: 'Insert block' }));
    expect(current.state.selection.$from.parent.textContent).toBe('/');
  });

  it('disables editing controls when the note is read-only', () => {
    open('Study', true);
    expect(screen.getByRole('combobox', { name: 'Block style' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insert block' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sticky notes' })).toBeDisabled();
  });

  it('inserts an editable sticky into the note without replacing selected text, and supports undo', () => {
    const current = open('Keep this text');
    current.commands.setTextSelection({ from: 1, to: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Sticky notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mint sticky note' }));
    expect(current.state.doc.child(0).textContent).toBe('Keep this text');
    expect(current.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(current.isActive('noteCard')).toBe(true);
    expect(current.state.doc.child(1).attrs).toMatchObject({ shape: 'sticky', tone: 'mint' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current.getMarkdown()).toBe('Keep this text');
  });

  it('inserts a multi-card layout directly on the note page', () => {
    const current = open('');
    fireEvent.click(screen.getByRole('button', { name: 'Layouts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cornell notes' }));
    expect(current.state.doc.child(0).type.name).toBe('noteLayout');
    expect(current.state.doc.child(0).childCount).toBe(3);
    expect(current.isActive('noteCard')).toBe(true);
    fireEvent.keyDown(current.view.dom, { key: 'Enter', ctrlKey: true });
    expect(current.isActive('noteCard')).toBe(false);
    expect(current.state.selection.$from.parent.type.name).toBe('paragraph');
  });
});
