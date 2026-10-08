import { afterEach, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { allowsSlashMenu } from '@/features/documents/lib/slashCommand';
let editor: Editor;
afterEach(() => editor?.destroy());
it('opens block insertion inside note sheets, keeping the spaces beside PDFs free of block menus', () => {
  editor = new Editor({
    extensions: noteExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'pdfPage',
          attrs: { src: 'attachments/a.pdf', page: 1, width: 595, height: 842, ink: '[]' },
        },
        {
          type: 'studyPage',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '/' }] }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '/' }] },
      ],
    },
  });
  expect(allowsSlashMenu(editor.state.doc, 3)).toBe(true);
  expect(allowsSlashMenu(editor.state.doc, 7)).toBe(false);
});
it('keeps ordinary Markdown slash menus and code blocks as before', () => {
  editor = new Editor({
    extensions: noteExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '/' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: '/' }] },
      ],
    },
  });
  expect(allowsSlashMenu(editor.state.doc, 1)).toBe(true);
  expect(allowsSlashMenu(editor.state.doc, 4)).toBe(false);
});
