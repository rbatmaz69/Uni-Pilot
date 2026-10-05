import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  blockAt,
  canMoveBlock,
  canTurnInto,
  deleteBlock,
  duplicateBlock,
  moveBlock,
  NoteBlockKeys,
} from './blockActions';
import { composeNote, noteExtensions } from './markdown';
import { createNoteVisual } from './noteVisuals';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  editor = new Editor({
    extensions: [...noteExtensions(), NoteBlockKeys],
    content: markdown,
    contentType: 'markdown',
  });
  return editor;
}
const saved = (current: Editor) => composeNote('', current.getMarkdown());
/** The position of the block whose text is `text`. */
function find(current: Editor, text: string) {
  let found = -1;
  current.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos + 1;
  });
  return blockAt(current.state.doc, found)!;
}
function press(current: Editor, key: string) {
  // jsdom is not a Mac, so `Mod` is Ctrl.
  const event = new KeyboardEvent('keydown', { key, shiftKey: true, ctrlKey: true });
  return current.view.someProp('handleKeyDown', (handler) => handler(current.view, event));
}

describe('finding the block beside the handle', () => {
  it('takes the top-level block, or the innermost list item', () => {
    const current = open('Intro\n\n- one\n  - nested\n- two\n');
    expect(find(current, 'Intro').node.type.name).toBe('paragraph');
    expect(find(current, 'nested').node.type.name).toBe('listItem');
    expect(find(current, 'nested').node.textContent).toBe('nested');
  });

  it('leaves cards and layouts to their own grip', () => {
    const current = open('');
    current.commands.setContent({ type: 'doc', content: [createNoteVisual('sticky-yellow')] });
    expect(blockAt(current.state.doc, 3)).toBeNull();
  });

  it('only offers “turn into” for blocks of text', () => {
    const current = open('Text\n\n$$\nx\n$$\n');
    expect(canTurnInto(find(current, 'Text'))).toBe(true);
    expect(canTurnInto(blockAt(current.state.doc, 6)!)).toBe(false);
  });
});

describe('moving, duplicating and deleting blocks', () => {
  it('swaps a block with its neighbour in one undoable step', () => {
    const current = open('A\n\nB\n\nC\n');
    moveBlock(current, find(current, 'C').pos, -1);
    expect(saved(current)).toBe('A\n\nC\n\nB\n');
    current.commands.undo();
    expect(saved(current)).toBe('A\n\nB\n\nC\n');
  });

  it('reorders list items within their list', () => {
    const current = open('- one\n- two\n- three\n');
    moveBlock(current, find(current, 'one').pos, 1);
    expect(saved(current)).toBe('- two\n- one\n- three\n');
  });

  it('does not move past the first or last block', () => {
    const current = open('A\n\nB\n');
    expect(canMoveBlock(current, find(current, 'A').pos, -1)).toBe(false);
    expect(moveBlock(current, find(current, 'A').pos, -1)).toBe(false);
  });

  it('duplicates a block below itself and deletes one', () => {
    const current = open('A\n\nB\n');
    duplicateBlock(current, find(current, 'A').pos);
    expect(saved(current)).toBe('A\n\nA\n\nB\n');
    deleteBlock(current, find(current, 'B').pos);
    expect(saved(current)).toBe('A\n\nA\n');
  });

  it('moves the block the cursor is in with ⌘/Ctrl + Shift + arrows, keeping the cursor', () => {
    const current = open('First\n\nSecond\n');
    current.commands.setTextSelection(10);
    press(current, 'ArrowUp');
    expect(saved(current)).toBe('Second\n\nFirst\n');
    expect(current.state.selection.$from.parent.textContent).toBe('Second');
    expect(current.state.selection.$from.parentOffset).toBe(2);
    press(current, 'ArrowDown');
    expect(saved(current)).toBe('First\n\nSecond\n');
  });

  it('changes nothing in a read-only note', () => {
    const current = open('A\n\nB\n');
    current.setEditable(false);
    expect(moveBlock(current, find(current, 'B').pos, -1)).toBe(false);
    expect(duplicateBlock(current, find(current, 'B').pos)).toBe(false);
    expect(deleteBlock(current, find(current, 'B').pos)).toBe(false);
    expect(saved(current)).toBe('A\n\nB\n');
  });
});
