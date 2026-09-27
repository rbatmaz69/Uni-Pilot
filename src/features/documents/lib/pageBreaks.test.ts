import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { NotePageBreaks, pageBreaks, setPageBreaks } from './pageBreaks';

let editor: Editor;
afterEach(() => editor?.destroy());

function open(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [...noteExtensions(), NotePageBreaks],
    content,
    contentType: 'markdown',
  });
  return editor;
}
const boundaries = () => editor.view.dom.querySelectorAll('.note-sheet-breaks > .note-sheet-break');

describe('NotePageBreaks', () => {
  it('leads the text with one float per page boundary', () => {
    open('# Lecture\n\nFirst paragraph');
    expect(boundaries()).toHaveLength(0);
    setPageBreaks(editor.view, 2);
    expect(pageBreaks(editor.state)).toBe(2);
    expect(boundaries()).toHaveLength(2);
    expect(editor.view.dom.firstElementChild).toHaveClass('note-sheet-breaks');
    expect(editor.view.dom.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    setPageBreaks(editor.view, 0);
    expect(boundaries()).toHaveLength(0);
  });

  it('never reaches the note, its undo history or its outline', () => {
    const content = '# Lecture\n\nFirst paragraph';
    open(content);
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' typed');
    setPageBreaks(editor.view, 3);
    expect(editor.getMarkdown()).toBe('# Lecture\n\nFirst paragraph typed');
    editor.commands.undo();
    expect(editor.getMarkdown()).toBe(content);
    expect(boundaries()).toHaveLength(3);
  });
});
