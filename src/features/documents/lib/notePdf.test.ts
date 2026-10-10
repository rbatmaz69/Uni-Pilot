import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { noteExtensions, findContentLoss } from './markdown';
import { notePdfAttributes } from './notePdf';

const attrs = {
  src: 'attachments/Übung (1).pdf',
  name: 'Übung [1] & Größen.pdf',
  size: 123456,
  view: 'embed',
};

describe('PDF attachment persistence', () => {
  it.each(['embed', 'card'])(
    'keeps %s PDFs and surrounding notes through repeated saves',
    (view) => {
      const editor = new Editor({ extensions: noteExtensions() });
      try {
        editor.commands.setContent({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
            { type: 'notePdf', attrs: { ...attrs, view } },
            { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
          ],
        });
        const before = editor.getJSON();
        const markdown = editor.getMarkdown();
        expect(markdown).toContain('[PDF](<attachments/%C3%9Cbung%20(1).pdf>)');
        for (let pass = 0; pass < 2; pass++) {
          editor.commands.setContent(markdown, { contentType: 'markdown' });
          expect(editor.getJSON()).toEqual(before);
          expect(editor.getMarkdown()).toBe(markdown);
          expect(findContentLoss(markdown, editor.getMarkdown())).toEqual([]);
        }
      } finally {
        editor.destroy();
      }
    },
  );

  it('keeps PDFs inside study pages and visual containers', () => {
    const editor = new Editor({ extensions: noteExtensions() });
    try {
      editor.commands.setContent({
        type: 'doc',
        content: [
          { type: 'studyPage', content: [{ type: 'notePdf', attrs }] },
          { type: 'noteCard', content: [{ type: 'notePdf', attrs: { ...attrs, view: 'card' } }] },
        ],
      });
      const before = editor.getJSON();
      const markdown = editor.getMarkdown();
      editor.commands.setContent(markdown, { contentType: 'markdown' });
      expect(editor.getJSON()).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it('keeps PDF metadata through HTML export and ordinary directive text as text', () => {
    const editor = new Editor({ extensions: noteExtensions() });
    try {
      editor.commands.setContent({ type: 'doc', content: [{ type: 'notePdf', attrs }] });
      const before = editor.getJSON();
      editor.commands.setContent(editor.getHTML());
      expect(editor.getJSON()).toEqual(before);
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: ':::notePdf' }] }],
      });
      const paragraph = editor.getJSON();
      editor.commands.setContent(editor.getMarkdown(), { contentType: 'markdown' });
      expect(editor.getJSON()).toEqual(paragraph);
    } finally {
      editor.destroy();
    }
  });

  it('keeps invalid directives readable instead of dropping their metadata', () => {
    const editor = new Editor({ extensions: noteExtensions() });
    const source =
      ':::notePdf\n[PDF](<attachments/test.pdf>)\n{"name":"test.pdf","size":-1,"view":"card"}\n:::';
    try {
      editor.commands.setContent(source, { contentType: 'markdown' });
      expect(editor.getJSON().content?.some((node) => node.type === 'notePdf')).toBe(false);
      expect(findContentLoss(source, editor.getMarkdown())).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it('rejects external targets, traversal, unsafe sizes and display metadata', () => {
    for (const changes of [
      { src: 'https://example.com/test.pdf' },
      { src: 'attachments/../test.pdf' },
      { size: Infinity },
      { view: 'other' },
      { name: 'bad\nname.pdf' },
    ])
      expect(notePdfAttributes({ ...attrs, ...changes })).toBeNull();
    expect(notePdfAttributes(attrs)).toEqual(attrs);
  });
});
