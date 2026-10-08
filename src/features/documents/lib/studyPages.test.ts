import { afterEach, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { noteExtensions } from '@/features/documents/lib/markdown';
import {
  insertStudyPages,
  pdfPageAttributes,
  readInk,
  validPdfAttachment,
} from '@/features/documents/lib/studyPages';
let editor: Editor | undefined;
afterEach(() => editor?.destroy());
const source = (page: number) => ({
  type: 'pdfPage',
  attrs: { src: 'attachments/original.pdf', page, width: 842, height: 595, ink: '[]' },
});
it('inserts two pages after every original, preserves existing notes and undoes the batch', () => {
  editor = new Editor({
    extensions: noteExtensions(),
    content: {
      type: 'doc',
      content: [
        source(1),
        {
          type: 'studyPage',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bestehende Lösung' }] }],
        },
        source(2),
      ],
    },
  });
  const before = editor.getJSON();
  expect(insertStudyPages(editor, 2, 'each')).toBe(true);
  expect(
    editor
      .getJSON()
      .content?.filter((n) => n.type !== 'paragraph')
      .map((n) => n.type),
  ).toEqual([
    'pdfPage',
    'studyPage',
    'studyPage',
    'studyPage',
    'pdfPage',
    'studyPage',
    'studyPage',
  ]);
  expect(editor.getText()).toContain('Bestehende Lösung');
  editor.commands.undo();
  expect(editor.getJSON().content?.filter((n) => n.type !== 'paragraph')).toEqual(
    before.content?.filter((n) => n.type !== 'paragraph'),
  );
});
it('inserts at an individual sheet and respects read-only documents and invalid counts', () => {
  editor = new Editor({
    extensions: noteExtensions(),
    content: { type: 'doc', content: [source(1), source(2)] },
  });
  expect(insertStudyPages(editor, 1, 0)).toBe(true);
  expect(editor.state.selection.$from.node(1).type.name).toBe('studyPage');
  expect(editor.state.selection.from).toBe(3);
  expect(
    editor
      .getJSON()
      .content?.filter((n) => n.type !== 'paragraph')
      .map((n) => n.type),
  ).toEqual(['pdfPage', 'studyPage', 'pdfPage']);
  expect(insertStudyPages(editor, 0, 'each')).toBe(false);
  expect(insertStudyPages(editor, 11, 'each')).toBe(false);
  editor.setEditable(false);
  expect(insertStudyPages(editor, 1, 'each')).toBe(false);
});
it('rejects invalid coordinates, annotation identities and unsafe attachment paths', () => {
  expect(
    readInk('[{"id":"a","type":"pen","color":"blue","width":2,"points":[{"x":null,"y":4}]}]'),
  ).toBeNull();
  expect(readInk('{}')).toBeNull();
  expect(readInk('[]')).toEqual([]);
  expect(validPdfAttachment('attachments/../private.pdf')).toBe(false);
  expect(validPdfAttachment('https://example.com/a.pdf')).toBe(false);
  expect(pdfPageAttributes({ ...source(1).attrs, width: Infinity })).toBeNull();
});

it('keeps insertion separate from previous typing when undoing', () => {
  editor = new Editor({
    extensions: noteExtensions(),
    content: {
      type: 'doc',
      content: [source(1), { type: 'studyPage', content: [{ type: 'paragraph' }] }, source(2)],
    },
  });
  editor.commands.setTextSelection(3);
  editor.commands.insertContent('Bestehende Notiz');
  const original = editor.getJSON();
  insertStudyPages(editor, 1, 0);
  editor.commands.undo();
  expect(editor.getJSON().content?.filter((node) => node.type !== 'paragraph')).toEqual(
    original.content?.filter((node) => node.type !== 'paragraph'),
  );
});
