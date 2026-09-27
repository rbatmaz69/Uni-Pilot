import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from './markdown';
import { footnoteOrder, insertFootnote, jumpToFootnote } from './noteFootnotes';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: noteExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
  return editor;
}
const saved = (current: Editor) => composeNote('', current.getMarkdown());
const numbers = (current: Editor) =>
  Array.from(current.view.dom.querySelectorAll('.note-footnote-ref'), (node) => node.textContent);

describe('footnotes', () => {
  it('adds a numbered reference at the cursor and its definition at the end', () => {
    const current = open('First claim.\n\nSecond claim.\n');
    current.commands.setTextSelection(13);
    insertFootnote(current);
    current.commands.insertContent('Source A.');
    expect(saved(current)).toBe('First claim.[^1]\n\nSecond claim.\n\n[^1]: Source A.\n');
  });

  it('continues after the highest number and keeps definitions together', () => {
    const current = open('A.[^1] B.\n\n[^1]: One.\n');
    current.commands.setTextSelection(7);
    insertFootnote(current);
    current.commands.insertContent('Two.');
    expect(saved(current)).toBe('A.[^1] B.[^2]\n\n[^1]: One.\n\n[^2]: Two.\n');
  });

  it('numbers footnotes in the order they are referenced, like GitHub', () => {
    const current = open('See[^b] then[^a].\n\n[^a]: A.\n\n[^b]: B.\n\n[^c]: Unused.\n');
    expect(footnoteOrder(current.state.doc)).toEqual(['b', 'a', 'c']);
    expect(numbers(current)).toEqual(['1', '2']);
  });

  it('opens the definition when its number in the text is pressed', () => {
    const current = open('Claim[^1].\n\n[^1]: Source.\n');
    const reference = current.view.dom.querySelector('.note-footnote-ref')!;
    reference.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    reference.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(current.state.selection.$from.parent.textContent).toBe('Source.');
  });

  it('moves between a reference and its definition', () => {
    const current = open('Claim[^1].\n\n[^1]: Source.\n');
    jumpToFootnote(current, '1', 'definition');
    expect(current.state.selection.$from.parent.textContent).toBe('Source.');
    jumpToFootnote(current, '1', 'reference');
    expect(current.state.selection.$from.parent.textContent).toBe('Claim.');
  });
});
