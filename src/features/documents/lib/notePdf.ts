import { Node } from '@tiptap/core';
import { lineStart } from './markdownTokens';
import { validPdfAttachment } from './studyPages';

export interface NotePdfAttributes {
  src: string;
  name: string;
  size: number;
  view: 'embed' | 'card';
}

/** Validate saved metadata before turning a directive into an attachment. */
export function notePdfAttributes(value: Record<string, unknown>): NotePdfAttributes | null {
  if (
    !validPdfAttachment(value.src) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 1024 ||
    Array.from(value.name).some(
      (letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127,
    ) ||
    !Number.isSafeInteger(value.size) ||
    Number(value.size) < 0 ||
    (value.view !== 'embed' && value.view !== 'card')
  )
    return null;
  return { src: value.src, name: value.name, size: Number(value.size), view: value.view };
}

/** A relative Markdown link keeps PDF attachments discoverable when notes move. */
export const NotePdf = Node.create<{ notePath: string }>({
  name: 'notePdf',
  priority: 900,
  group: 'block',
  atom: true,
  isolating: true,
  draggable: true,
  addOptions: () => ({ notePath: '' }),
  addAttributes: () => ({
    src: { default: '' },
    name: { default: 'Dokument.pdf' },
    size: { default: 0 },
    view: { default: 'embed' },
  }),
  parseHTML: () => [
    {
      tag: 'section[data-note-pdf]',
      getAttrs(element) {
        try {
          return (
            notePdfAttributes(
              JSON.parse(element.getAttribute('data-note-pdf') ?? '') as Record<string, unknown>,
            ) ?? false
          );
        } catch {
          return false;
        }
      },
    },
  ],
  renderHTML({ node }) {
    return [
      'section',
      { 'data-note-pdf': JSON.stringify(node.attrs), class: 'note-pdf-placeholder' },
      ['a', { href: String(node.attrs.src) }, String(node.attrs.name)],
    ];
  },
  markdownTokenizer: {
    name: 'notePdf',
    level: 'block',
    start: lineStart(/:::notePdf\r?\n/),
    tokenize(src) {
      const match =
        /^:::notePdf\r?\n\[PDF\]\(<([^>\r\n]+)>\)\r?\n([^\r\n]+)\r?\n:::[ \t]*(?:\r?\n|$)/.exec(
          src,
        );
      if (!match) return;
      try {
        const attrs = notePdfAttributes({
          ...(JSON.parse(match[2]!) as Record<string, unknown>),
          src: decodeURIComponent(match[1]!),
        });
        if (!attrs) return;
        return { type: 'notePdf', raw: match[0], attributes: attrs };
      } catch {
        return;
      }
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('notePdf', token.attributes);
  },
  renderMarkdown(node) {
    const attrs = notePdfAttributes(node.attrs ?? {});
    if (!attrs) throw new Error('Der gespeicherte PDF-Anhang ist ungültig.');
    const link = attrs.src.split('/').map(encodeURIComponent).join('/');
    return `:::notePdf\n[PDF](<${link}>)\n${JSON.stringify({ name: attrs.name, size: attrs.size, view: attrs.view })}\n:::`;
  },
});
