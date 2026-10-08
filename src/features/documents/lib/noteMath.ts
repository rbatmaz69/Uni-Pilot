import { blockInsertionRange } from './selectionActions';
import { InputRule, type Editor, type JSONContent } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { NodeSelection } from '@tiptap/pm/state';
import katex from 'katex';
// Chemistry formulas such as \ce{H2O}; registers itself with KaTeX.
import 'katex/contrib/mhchem';
import { lineStart } from './markdownTokens';

/**
 * Formulas are LaTeX between dollar signs, as in Obsidian, Typora and on
 * GitHub: `$x^2$` inside a line, `$$ … $$` as a block of its own.
 *
 * `$…$` follows Pandoc's rule, so amounts of money stay text: the opening `$`
 * is followed by a non-space, the closing one follows a non-space and is not
 * followed by a digit. “5 $ and 10 $” or “$5 and $10” are never formulas.
 * Text is written with `\$` wherever a `$` could start one (see
 * `escapeMarkdownText`).
 */
const INLINE_MATH = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;
// A block ends at the next `$$` and, like a paragraph, never spans a blank line.
const BLOCK_MATH = /^\$\$((?:(?!\$\$|\n[ \t]*\n)[\s\S])*)\$\$[ \t]*(?:\r?\n|$)/;
// Typing the closing `$` of `$x^2$` turns it into a formula.
const INLINE_MATH_INPUT = /(?:^|[\s([{])(\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$)$/;

/** Whether Markdown starting here is read as a `$…$` formula. */
export function opensFormula(markdown: string): boolean {
  return INLINE_MATH.test(markdown);
}

const KATEX_OPTIONS = { throwOnError: true, strict: 'ignore' } as const;

export type MathRender = { html: string; error: null } | { html: null; error: string };

/** KaTeX's HTML for `latex`, or the reason it cannot be typeset. */
export function renderMath(latex: string, displayMode: boolean): MathRender {
  try {
    return { html: katex.renderToString(latex, { ...KATEX_OPTIONS, displayMode }), error: null };
  } catch (cause) {
    return {
      html: null,
      error: cause instanceof katex.ParseError ? cause.rawMessage : String(cause),
    };
  }
}

/** A formula inside a line is one line of LaTeX without outer spaces. */
export function inlineLatex(latex: unknown): string {
  return typeof latex === 'string' ? latex.replace(/\s*\n\s*/g, ' ').trim() : '';
}

/** Blank lines mean nothing in display math but would end the block in Markdown. */
export function blockLatex(latex: unknown): string {
  return typeof latex === 'string'
    ? latex
        .replace(/\r\n?/g, '\n')
        .replace(/\n[ \t]*(?=\n)/g, '')
        .replace(/^\n+|\n+$/g, '')
    : '';
}

export const NoteInlineMath = InlineMath.extend({
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-latex': inlineLatex(attributes.latex),
        }),
      },
    };
  },
  // Other apps and plain-text copies still show the formula's source.
  renderHTML({ node, HTMLAttributes }) {
    const latex = inlineLatex(node.attrs.latex);
    return ['span', { ...HTMLAttributes, 'data-type': 'inline-math' }, latex ? `$${latex}$` : ''];
  },
  renderText({ node }) {
    const latex = inlineLatex(node.attrs.latex);
    return latex ? `$${latex}$` : '';
  },
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src) => src.indexOf('$'),
    tokenize(src) {
      const match = INLINE_MATH.exec(src);
      if (!match) return;
      return { type: 'inlineMath', raw: match[0], latex: match[1] };
    },
  },
  parseMarkdown: (token) => ({ type: 'inlineMath', attrs: { latex: String(token.latex ?? '') } }),
  // An empty formula has nothing to keep; `$$` would read back as text.
  renderMarkdown(node) {
    const latex = inlineLatex(node.attrs?.latex);
    return latex ? `$${latex}$` : '';
  },
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT,
        handler: ({ state, range, match }) => {
          const [whole, formula, latex] = match;
          if (!formula || !latex) return;
          const from = range.from + whole.length - formula.length;
          state.tr.replaceWith(from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
});

export const NoteBlockMath = BlockMath.extend({
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-latex': blockLatex(attributes.latex),
        }),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const latex = blockLatex(node.attrs.latex);
    return ['div', { ...HTMLAttributes, 'data-type': 'block-math' }, latex ? `$$${latex}$$` : ''];
  },
  renderText({ node }) {
    const latex = blockLatex(node.attrs.latex);
    return latex ? `$$${latex}$$` : '';
  },
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: lineStart(/\$\$/),
    tokenize(src) {
      const match = BLOCK_MATH.exec(src);
      if (!match) return;
      return { type: 'blockMath', raw: match[0], latex: blockLatex(match[1]?.trim()) };
    },
  },
  parseMarkdown: (token) => ({ type: 'blockMath', attrs: { latex: String(token.latex ?? '') } }),
  renderMarkdown(node) {
    const latex = blockLatex(node.attrs?.latex);
    return latex ? `$$\n${latex}\n$$` : '';
  },
  addInputRules() {
    // `$$` and a space on an empty line, like "```" for code.
    return [
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '$$') return;
          const from = $from.before();
          const to = $from.after();
          const parent = $from.node(-1);
          if (!parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type)) return;
          const formula = this.type.create({ latex: '' });
          // The last block gets a line after it, so writing can go on below.
          const last = $from.indexAfter(-1) === parent.childCount;
          const paragraph = state.schema.nodes.paragraph?.create();
          state.tr.replaceWith(from, to, last && paragraph ? [formula, paragraph] : formula);
          state.tr.setSelection(NodeSelection.create(state.tr.doc, from));
        },
      }),
    ];
  },
});

/** Marks the transaction that asks the formula at this position to open for editing. */
export const EDIT_FORMULA = 'noteEditFormula';

/** Enter on a selected formula opens it; returns whether there was one. */
export function editSelectedFormula(editor: Editor, type: 'inlineMath' | 'blockMath') {
  const { selection } = editor.state;
  if (!editor.isEditable || !(selection instanceof NodeSelection)) return false;
  if (selection.node.type.name !== type) return false;
  editor.view.dispatch(editor.state.tr.setMeta(EDIT_FORMULA, selection.from));
  return true;
}

/**
 * Inserts an empty formula, which opens for typing. Inside a line it goes at
 * the cursor; a block goes after the current block, like other inserted blocks.
 */
export function insertFormula(editor: Editor, display: boolean) {
  if (!editor.isEditable) return false;
  if (!display) return editor.chain().focus().insertContent({ type: 'inlineMath' }).run();
  const { from, to: end } = blockInsertionRange(editor);
  const formula: JSONContent = { type: 'blockMath', attrs: { latex: '' } };
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to: end }, [formula, { type: 'paragraph' }])
    .run();
}
