import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from './markdown';
import { NoteSearch, noteSearchState, setNoteSearch } from './noteSearch';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [...noteExtensions(), NoteSearch],
    content: markdown,
    contentType: 'markdown',
  });
  return editor;
}

describe('find in note highlighting', () => {
  it('highlights every match and marks the current one', () => {
    const current = open('variance, Variance, VARIANCE');
    setNoteSearch(current.view, 'variance', 1);
    expect(current.view.dom.querySelectorAll('.note-search-match')).toHaveLength(3);
    expect(current.view.dom.querySelector('.is-current')?.textContent).toBe('Variance');
  });

  it('wraps the current match around both ends', () => {
    const current = open('a b a b a');
    setNoteSearch(current.view, 'a', 3);
    expect(noteSearchState(current.state)?.current).toBe(0);
    setNoteSearch(current.view, 'a', -1);
    expect(noteSearchState(current.state)?.current).toBe(2);
  });

  it('follows edits and never changes the saved note or its undo history', () => {
    const current = open('mean');
    setNoteSearch(current.view, 'mean');
    current.commands.insertContentAt(current.state.doc.content.size - 1, ' mean');
    expect(noteSearchState(current.state)?.matches).toHaveLength(2);
    expect(composeNote('', current.getMarkdown())).toBe('mean mean\n');
    current.commands.undo();
    expect(composeNote('', current.getMarkdown())).toBe('mean\n');
    setNoteSearch(current.view, '');
    expect(current.view.dom.querySelector('.note-search-match')).toBeNull();
  });
});
