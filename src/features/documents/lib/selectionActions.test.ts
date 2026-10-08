import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, expect, it } from 'vitest';
import { noteExtensions } from './markdown';
import { insertSelectionTable, wrapSelection } from './selectionActions';
import { insertToggle } from './noteDetails';
import { insertFormula } from './noteMath';
import { insertNoteVisual } from './noteVisuals';
let editor: Editor;
afterEach(() => editor?.destroy());
function note() {
  editor = new Editor({
    extensions: noteExtensions(),
    content:
      '<section data-study-page><p>Keep this whole sentence.</p><p>Next paragraph</p></section>',
  });
  editor.commands.setTextSelection({ from: 7, to: 11 });
  return editor.getJSON();
}
it('inserts a table within the note sheet without replacing selected words; one undo restores the note', () => {
  const before = note();
  expect(insertSelectionTable(editor, 2, 3)).toBe(true);
  const sheet = editor.getJSON().content?.[0] as JSONContent;
  expect(sheet?.content?.map((node) => node.type)).toEqual(['paragraph', 'table', 'paragraph']);
  expect(editor.state.doc.textContent).toBe('Keep this whole sentence.Next paragraph');
  expect(editor.isActive('table')).toBe(true);
  expect(sheet?.content?.[1]?.content).toHaveLength(2);
  expect(sheet?.content?.[1]?.content?.[0]?.content).toHaveLength(3);
  editor.commands.undo();
  expect(editor.getJSON()).toEqual(before);
});
it.each(['toggle', 'formula', 'callout'] as const)(
  'keeps an inserted %s inside its PDF note sheet',
  (kind) => {
    note();
    editor.commands.setTextSelection(12);
    if (kind === 'toggle') insertToggle(editor);
    else if (kind === 'formula') insertFormula(editor, true);
    else insertNoteVisual(editor, 'sticky-yellow');
    expect(editor.getJSON().content?.[0]?.type).toBe('studyPage');
    const sheet = editor.getJSON().content?.[0] as JSONContent;
    expect(sheet.content?.map((node) => node.type)).toContain(
      kind === 'toggle' ? 'details' : kind === 'formula' ? 'blockMath' : 'noteCard',
    );
    expect(editor.state.doc.textContent).toContain('Keep this whole sentence.');
    expect(
      editor.getJSON().content?.filter((node) => !['studyPage', 'paragraph'].includes(node.type)),
    ).toEqual([]);
  },
);
it.each(['callout', 'toggle'] as const)(
  'converts a selected paragraph to %s without losing unselected words or leaving the sheet',
  (kind) => {
    const before = note();
    expect(wrapSelection(editor, kind)).toBe(true);
    expect(editor.getJSON().content?.[0]?.type).toBe('studyPage');
    expect(editor.state.doc.textContent).toBe('Keep this whole sentence.Next paragraph');
    const saved = editor.getMarkdown();
    editor.commands.setContent(saved, { contentType: 'markdown' });
    expect(editor.getMarkdown()).toBe(saved);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.type).toBe(
      kind === 'callout' ? 'noteCard' : 'details',
    );
    editor.commands.setContent(before);
    editor.setEditable(false);
    expect(wrapSelection(editor, kind)).toBe(false);
  },
);

it('exits a callout inside a PDF note sheet without jumping outside that sheet', () => {
  note();
  wrapSelection(editor, 'callout');
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  expect(editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event))).toBe(
    true,
  );
  expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  expect(editor.state.selection.$from.node(1).type.name).toBe('studyPage');
  expect(editor.isActive('noteCard')).toBe(false);
});
