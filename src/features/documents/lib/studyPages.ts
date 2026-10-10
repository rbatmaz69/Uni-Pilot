import { Node, type Editor, type JSONContent } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { lineStart } from '@/features/documents/lib/markdownTokens';
import { INK_COLORS, type Annotation } from '@/features/documents/lib/pdfInkTypes';

export interface PdfPageAttributes {
  src: string;
  page: number;
  width: number;
  height: number;
  ink: string;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const dimension = (value: unknown): value is number =>
  finite(value) && value >= 36 && value <= 14400;
const coordinate = (value: unknown): value is number => finite(value) && Math.abs(value) <= 100000;

export function validPdfAttachment(src: unknown): src is string {
  if (typeof src !== 'string' || !src.startsWith('attachments/')) return false;
  const name = src.slice('attachments/'.length);
  return (
    name.length <= 240 &&
    /\.pdf$/i.test(name) &&
    !/[\\/<>]/.test(name) &&
    Array.from(name).every((c) => c.charCodeAt(0) >= 32)
  );
}

/** Invalid metadata stays ordinary Markdown rather than losing saved annotations. */
export function readInk(value: unknown): Annotation[] | null {
  if (typeof value !== 'string') return null;
  try {
    const ink: unknown = JSON.parse(value);
    if (!Array.isArray(ink) || ink.length > 10000) return null;
    const ids = new Set<string>();
    for (const item of ink) {
      if (!item || typeof item !== 'object') return null;
      const a = item as Record<string, unknown>;
      if (typeof a.id !== 'string' || !a.id || ids.has(a.id) || a.id.length > 100) return null;
      ids.add(a.id);
      if (typeof a.color !== 'string' || !Object.hasOwn(INK_COLORS, a.color)) return null;
      if (a.type === 'text') {
        if (
          !coordinate(a.x) ||
          !coordinate(a.y) ||
          !finite(a.width) ||
          a.width < 1 ||
          a.width > 14400 ||
          !finite(a.fontSize) ||
          a.fontSize < 1 ||
          a.fontSize > 200 ||
          typeof a.text !== 'string' ||
          a.text.length > 20000
        )
          return null;
      } else if (a.type === 'highlight') {
        if (
          !Array.isArray(a.rects) ||
          !a.rects.length ||
          a.rects.length > 5000 ||
          a.rects.some((rect: unknown) => {
            if (!rect || typeof rect !== 'object') return true;
            const r = rect as Record<string, unknown>;
            return (
              !coordinate(r.x) ||
              !coordinate(r.y) ||
              !finite(r.width) ||
              r.width <= 0 ||
              r.width > 14400 ||
              !finite(r.height) ||
              r.height <= 0 ||
              r.height > 14400
            );
          })
        )
          return null;
      } else if (a.type === 'pen' || a.type === 'marker') {
        if (
          !finite(a.width) ||
          a.width <= 0 ||
          a.width > 200 ||
          !Array.isArray(a.points) ||
          !a.points.length ||
          a.points.length > 50000 ||
          a.points.some(
            (p: unknown) =>
              !p ||
              typeof p !== 'object' ||
              !coordinate((p as Record<string, unknown>).x) ||
              !coordinate((p as Record<string, unknown>).y),
          )
        )
          return null;
      } else return null;
    }
    return ink as Annotation[];
  } catch {
    return null;
  }
}

export function pdfPageAttributes(value: Record<string, unknown>): PdfPageAttributes | null {
  if (
    !validPdfAttachment(value.src) ||
    !Number.isInteger(value.page) ||
    Number(value.page) < 1 ||
    Number(value.page) > 1500 ||
    !dimension(value.width) ||
    !dimension(value.height) ||
    readInk(value.ink) === null
  )
    return null;
  return value as unknown as PdfPageAttributes;
}

export const NotePdfPage = Node.create<{ notePath: string }>({
  name: 'pdfPage',
  priority: 900,
  group: 'block',
  atom: true,
  isolating: true,
  addOptions: () => ({ notePath: '' }),
  addAttributes: () => ({
    src: { default: '' },
    page: { default: 1 },
    width: { default: 595 },
    height: { default: 842 },
    ink: { default: '[]' },
  }),
  parseHTML: () => [
    {
      tag: 'section[data-pdf-page]',
      getAttrs: (element) => {
        try {
          return (
            pdfPageAttributes(
              JSON.parse(element.getAttribute('data-pdf-page') ?? '') as Record<string, unknown>,
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
      { 'data-pdf-page': JSON.stringify(node.attrs), class: 'study-source-placeholder' },
      `PDF · Seite ${node.attrs.page}`,
    ];
  },
  markdownTokenizer: {
    name: 'pdfPage',
    level: 'block',
    start: lineStart(/:::pdfPage\r?\n/),
    tokenize(src) {
      const match =
        /^:::pdfPage\r?\n\[Original\]\(<([^>\r\n]+)>\)\r?\n([^\r\n]+)\r?\n:::[ \t]*(?:\r?\n|$)/.exec(
          src,
        );
      if (!match) return;
      try {
        const metadata = JSON.parse(match[2]!) as Record<string, unknown>;
        const attrs = pdfPageAttributes({
          ...metadata,
          src: decodeURIComponent(match[1]!),
          ink: JSON.stringify(metadata.annotations),
        });
        if (!attrs) return;
        return { type: 'pdfPage', raw: match[0], attributes: attrs };
      } catch {
        return;
      }
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('pdfPage', token.attributes);
  },
  renderMarkdown(node) {
    const attrs = pdfPageAttributes(node.attrs ?? {});
    if (!attrs) throw new Error('Die gespeicherte PDF-Seite ist ungültig.');
    const link = attrs.src.split('/').map(encodeURIComponent).join('/');
    return `:::pdfPage\n[Original](<${link}>)\n${JSON.stringify({ page: attrs.page, width: attrs.width, height: attrs.height, annotations: readInk(attrs.ink) })}\n:::`;
  },
});

export const NoteStudyPage = Node.create({
  name: 'studyPage',
  priority: 900,
  group: 'block',
  content:
    '(paragraph | heading | bulletList | orderedList | taskList | blockquote | codeBlock | horizontalRule | image | notePdf | table | blockMath | noteCard | noteLayout | details | footnoteDefinition)+',
  addAttributes: () => ({
    ink: { default: '[]', parseHTML: (element) => element.getAttribute('data-study-ink') ?? '[]' },
  }),
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: 'section[data-study-page]' }],
  renderHTML: ({ node }) => [
    'section',
    { 'data-study-page': '', 'data-study-ink': String(node.attrs.ink), class: 'study-note-sheet' },
    ['div', { class: 'study-note-body' }, 0],
  ],
  markdownTokenizer: {
    name: 'studyPage',
    level: 'block',
    start: lineStart(/:{3,}studyPage(?: [^\r\n]+)?\r?\n/),
    tokenize(src, _tokens, lexer) {
      const header = /^(:{3,})studyPage(?: ([^\r\n]+))?\r?\n/.exec(src);
      if (!header) return;
      let ink = '[]';
      if (header[2]) {
        try {
          const meta = JSON.parse(header[2]) as Record<string, unknown>;
          ink = JSON.stringify(meta.annotations);
          if (!readInk(ink)) return;
        } catch {
          return;
        }
      }
      const body = src.slice(header[0].length);
      const end = new RegExp(`^${header[1]}[ \\t]*(?:\\r?\\n|$)`, 'm').exec(body);
      if (!end) return;
      return {
        type: 'studyPage',
        attributes: { ink },
        raw: src.slice(0, header[0].length + end.index + end[0].length),
        tokens: lexer.blockTokens(body.slice(0, end.index)),
      };
    },
  },
  parseMarkdown(token, helpers) {
    const children = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      'studyPage',
      token.attributes,
      children.length ? children : [{ type: 'paragraph' }],
    );
  },
  renderMarkdown(node, helpers) {
    const text = helpers.renderChildren(node.content ?? [], '\n\n');
    const longest = Math.max(2, ...Array.from(text.matchAll(/^(:{3,})/gm), (m) => m[1]!.length));
    const fence = ':'.repeat(longest + 1);
    const ink = readInk(node.attrs?.ink ?? '[]');
    if (!ink) throw new Error('Die Markierungen der Notizseite sind ungültig.');
    return `${fence}studyPage${ink.length ? ` ${JSON.stringify({ annotations: ink })}` : ''}\n${text}\n${fence}`;
  },
});

export const emptyStudyPage = (): JSONContent => ({
  type: 'studyPage',
  content: [{ type: 'paragraph' }],
});

/** One transaction makes a batch insert undoable in a single step. */
export function insertStudyPages(editor: Editor, count: number, after: 'each' | number): boolean {
  if (!editor.isEditable || !Number.isInteger(count) || count < 1 || count > 10) return false;
  const positions: number[] = [];
  editor.state.doc.forEach((node, pos) => {
    if (after === 'each' ? node.type.name === 'pdfPage' : pos === after)
      positions.push(pos + node.nodeSize);
  });
  if (!positions.length) return false;
  let pages = 0;
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'pdfPage' || node.type.name === 'studyPage') pages++;
  });
  if (pages + positions.length * count > 1500)
    throw new Error('Ein Dokument kann höchstens 1500 Seiten enthalten.');
  const nodes = Array.from({ length: count }, () => editor.schema.nodeFromJSON(emptyStudyPage()));
  const first = positions[0]!;
  const tr = closeHistory(editor.state.tr);
  positions.reverse().forEach((pos) => tr.insert(pos, Fragment.fromArray(nodes)));
  tr.setSelection(TextSelection.near(tr.doc.resolve(first + 2))).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.view.focus();
  requestAnimationFrame(() => {
    if (editor.isDestroyed || editor.state.doc.nodeAt(first)?.type.name !== 'studyPage') return;
    const sheet = editor.view.nodeDOM(first);
    if (sheet instanceof HTMLElement) sheet.scrollIntoView?.({ block: 'start' });
  });
  return true;
}
