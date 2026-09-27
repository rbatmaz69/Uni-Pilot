import { mergeAttributes, Node, type Editor, type MarkdownTokenizer } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { lineStart } from './markdownTokens';

/**
 * Footnotes as GitHub writes them: `[^1]` in the text and a definition
 * `[^1]: …` anywhere in the note, usually at its end. The label is only an
 * identifier; like GitHub, the page numbers footnotes in the order they are
 * referenced, and the file keeps its labels.
 */
const LABEL = /[^\]\s^]+/;
const REFERENCE = new RegExp(`^\\[\\^(${LABEL.source})\\]`);
const DEFINITION = new RegExp(`^\\[\\^(${LABEL.source})\\]:[ \\t]?`);
// Continuation lines are indented; a blank line followed by unindented text ends it.
const CONTINUATION = /^(?: {4}|\t|[ \t]*$)/;

function label(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return LABEL.exec(text)?.[0] === text ? text : '';
}

/** Every footnote label in the order of its first reference, then unreferenced definitions. */
export function footnoteOrder(doc: ProseMirrorNode): string[] {
  const order: string[] = [];
  const add = (name: string) => {
    if (name && !order.includes(name)) order.push(name);
  };
  doc.descendants((node) => {
    if (node.type.name === 'footnoteReference') add(label(node.attrs.label));
  });
  doc.descendants((node) => {
    if (node.type.name === 'footnoteDefinition') add(label(node.attrs.label));
  });
  return order;
}

/** The number a footnote shows, counted like GitHub counts them. */
export function footnoteNumber(doc: ProseMirrorNode, name: string): number {
  return footnoteOrder(doc).indexOf(name) + 1;
}

function findNode(doc: ProseMirrorNode, type: string, name: string): number | null {
  let found = -1;
  doc.descendants((node, position) => {
    if (found >= 0) return false;
    if (node.type.name === type && node.attrs.label === name) found = position;
  });
  return found >= 0 ? found : null;
}

/** Moves the cursor between a footnote's first reference and its definition. */
export function jumpToFootnote(editor: Editor, name: string, to: 'definition' | 'reference') {
  const { doc } = editor.state;
  const position = findNode(
    doc,
    to === 'definition' ? 'footnoteDefinition' : 'footnoteReference',
    name,
  );
  if (position === null) return false;
  // Into the definition's text, or just after the reference.
  const target = to === 'definition' ? position + 2 : position + 1;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(target))).scrollIntoView();
      return true;
    })
    .run();
  return true;
}

const referenceTokenizer: MarkdownTokenizer = {
  name: 'footnoteReference',
  level: 'inline',
  start: (src) => src.indexOf('[^'),
  tokenize(src) {
    const match = REFERENCE.exec(src);
    if (!match) return;
    return { type: 'footnoteReference', raw: match[0], label: match[1] };
  },
};

const definitionTokenizer: MarkdownTokenizer = {
  name: 'footnoteDefinition',
  level: 'block',
  start: lineStart(/\[\^[^\]\s^]+\]:/),
  tokenize(src, _tokens, lexer) {
    const match = DEFINITION.exec(src);
    if (!match) return;
    const lines = src.slice(match[0].length).split('\n');
    let end = 1;
    while (end < lines.length && CONTINUATION.test(lines[end]!)) end += 1;
    // Trailing blank lines separate the definition from what follows.
    while (end > 1 && !lines[end - 1]!.trim()) end -= 1;
    const body = lines
      .slice(0, end)
      .map((line, index) => (index ? line.replace(/^(?: {4}|\t)/, '') : line))
      .join('\n');
    const rest = src.slice(match[0].length);
    const through = lines.slice(0, end).join('\n');
    return {
      type: 'footnoteDefinition',
      raw: match[0] + through + (rest.length > through.length ? '\n' : ''),
      label: match[1],
      tokens: lexer.blockTokens(body),
    };
  },
};

export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: {
        default: '1',
        parseHTML: (element) => label(element.getAttribute('data-footnote')) || '1',
        renderHTML: (attributes) => ({ 'data-footnote': label(attributes.label) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'sup[data-footnote]' }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'note-footnote-ref' }),
      `[^${label(node.attrs.label)}]`,
    ];
  },
  renderText: ({ node }) => `[^${label(node.attrs.label)}]`,
  markdownTokenizer: referenceTokenizer,
  parseMarkdown: (token) => ({ type: 'footnoteReference', attrs: { label: label(token.label) } }),
  renderMarkdown: (node) => `[^${label(node.attrs?.label) || '1'}]`,
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('sup');
      dom.className = 'note-footnote-ref';
      dom.dataset.footnote = String(node.attrs.label);
      const show = () => {
        const number = footnoteNumber(editor.state.doc, String(node.attrs.label));
        dom.textContent = String(number || node.attrs.label);
        dom.title = `Footnote ${number || node.attrs.label} · click to read it`;
      };
      show();
      // Press and release, not `click`: ProseMirror makes the node draggable
      // on the press to select it, and Chrome then drops the click.
      let pressed = false;
      dom.addEventListener('mousedown', (event) => {
        pressed = event.button === 0;
      });
      dom.addEventListener('mouseup', (event) => {
        if (pressed && event.button === 0)
          jumpToFootnote(editor, String(node.attrs.label), 'definition');
        pressed = false;
      });
      // Numbers follow the order of references, which any edit may change.
      editor.on('update', show);
      return {
        dom,
        update: (next) => {
          if (next.type !== node.type || next.attrs.label !== node.attrs.label) return false;
          show();
          return true;
        },
        destroy: () => editor.off('update', show),
      };
    };
  },
});

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content:
    '(paragraph | bulletList | orderedList | taskList | blockquote | codeBlock | blockMath | image | table)+',
  defining: true,
  addAttributes() {
    return {
      label: {
        default: '1',
        parseHTML: (element) => label(element.getAttribute('data-footnote')) || '1',
        renderHTML: (attributes) => ({ 'data-footnote': label(attributes.label) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-footnote]' }],
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'note-footnote' }), 0];
  },
  markdownTokenizer: definitionTokenizer,
  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      'footnoteDefinition',
      { label: label(token.label) },
      content.length ? content : [{ type: 'paragraph' }],
    );
  },
  renderMarkdown(node, helpers) {
    const body = helpers.renderChildren(node.content ?? [], '\n\n');
    const indented = body
      .split('\n')
      .map((line, index) => (index && line ? `    ${line}` : line))
      .join('\n');
    return `[^${label(node.attrs?.label) || '1'}]: ${indented}`;
  },
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'note-footnote';
      dom.dataset.footnote = String(node.attrs.label);
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'note-footnote-label';
      back.contentEditable = 'false';
      const content = document.createElement('div');
      content.className = 'note-footnote-body';
      dom.append(back, content);
      const show = () => {
        const number = footnoteNumber(editor.state.doc, String(node.attrs.label));
        back.textContent = `${number || node.attrs.label}.`;
        back.setAttribute(
          'aria-label',
          `Back to footnote ${number || node.attrs.label} in the text`,
        );
      };
      show();
      back.addEventListener('click', () =>
        jumpToFootnote(editor, String(node.attrs.label), 'reference'),
      );
      editor.on('update', show);
      return {
        dom,
        contentDOM: content,
        update: (next) => {
          if (next.type !== node.type || next.attrs.label !== node.attrs.label) return false;
          show();
          return true;
        },
        stopEvent: (event) => event.target === back,
        ignoreMutation: (mutation) => back.contains(mutation.target),
        destroy: () => editor.off('update', show),
      };
    };
  },
});

/** Where a new definition goes: after the last one, or at the end before an empty last line. */
function definitionPosition(doc: ProseMirrorNode): number {
  let after = -1;
  doc.forEach((node, offset) => {
    if (node.type.name === 'footnoteDefinition') after = offset + node.nodeSize;
  });
  if (after >= 0) return after;
  const last = doc.lastChild;
  const emptyLast = last?.type.name === 'paragraph' && !last.content.size;
  return doc.content.size - (emptyLast ? last.nodeSize : 0);
}

/**
 * Adds a footnote at the cursor: a reference with the next free number and an
 * empty definition with the others at the end, where the cursor goes to write it.
 */
export function insertFootnote(editor: Editor) {
  if (!editor.isEditable) return false;
  const used = footnoteOrder(editor.state.doc).map(Number).filter(Number.isInteger);
  const name = String(Math.max(0, ...used) + 1);
  return editor
    .chain()
    .focus()
    .insertContent({ type: 'footnoteReference', attrs: { label: name } })
    .command(({ tr }) => {
      const { schema } = tr.doc.type;
      const at = definitionPosition(tr.doc);
      tr.insert(
        at,
        schema.nodes.footnoteDefinition!.create({ label: name }, schema.nodes.paragraph!.create()),
      );
      tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2))).scrollIntoView();
      return true;
    })
    .run();
}
