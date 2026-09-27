import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from './markdown';
import { NoteTypography } from './typography';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown = '') {
  editor = new Editor({
    extensions: [...noteExtensions(), NoteTypography],
    content: markdown,
    contentType: 'markdown',
  });
  return editor;
}

/** Types `text` one character at a time, the way input rules see a keyboard. */
function type(current: Editor, text: string) {
  for (const character of text) {
    const { from, to } = current.state.selection;
    const handled = current.view.someProp('handleTextInput', (handler) =>
      handler(current.view, from, to, character, () => current.state.tr),
    );
    if (!handled) current.view.dispatch(current.state.tr.insertText(character, from, to));
  }
}

const text = (current: Editor) => current.state.doc.textContent;

describe('typographic replacements while typing', () => {
  it.each([
    ['a -> b', 'a → b'],
    ['a <- b', 'a ← b'],
    ['a <-> b', 'a ↔ b'],
    ['p => q', 'p ⇒ q'],
    ['p <=> q', 'p ⇔ q'],
    ['x >= 1', 'x ≥ 1'],
    ['x <= 1', 'x ≤ 1'],
    ['x != 1', 'x ≠ 1'],
    ['pi ~= 3.14', 'pi ≈ 3.14'],
    ['+/- 2', '± 2'],
    ['wait...', 'wait…'],
    ['1/2 cup', '½ cup'],
    ['now -- later', 'now — later'],
  ])('turns “%s” into “%s”', (typed, expected) => {
    const current = open();
    type(current, typed);
    expect(text(current)).toBe(expected);
  });

  it.each([
    ['sub-tasks (a), (b), (c)', 'sub-tasks (a), (b), (c)'],
    ['quotes "as typed"', 'quotes "as typed"'],
    ['x^2 and 0x1F', 'x^2 and 0x1F'],
    ['a << 2', 'a << 2'],
  ])('leaves “%s” as typed', (typed, expected) => {
    const current = open();
    type(current, typed);
    expect(text(current)).toBe(expected);
  });

  it('brings the typed characters back with Backspace', () => {
    const current = open();
    type(current, 'a ->');
    expect(text(current)).toBe('a →');
    current.commands.undoInputRule();
    expect(text(current)).toBe('a ->');
  });

  it('keeps code exactly as typed', () => {
    const current = open('```\n\n```\n');
    current.commands.setTextSelection(1);
    type(current, 'if (a != b) x => x');
    expect(text(current)).toBe('if (a != b) x => x');
  });

  it('writes the symbols into the Markdown file as plain characters', () => {
    const current = open();
    type(current, 'x >= 1 -> done');
    expect(composeNote('', current.getMarkdown())).toBe('x ≥ 1 → done\n');
  });
});
