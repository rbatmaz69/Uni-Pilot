import type { Editor, JSONContent, MarkdownTokenizer } from '@tiptap/core';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { lineStart } from './markdownTokens';
import { blockInsertionRange } from './selectionActions';

/**
 * A toggle: a summary line that opens to show its content, e.g. a question
 * whose answer stays hidden until you check yourself. It is written as HTML
 * `<details>`, which GitHub, Obsidian and VS Code render as a toggle too,
 * with ordinary Markdown between its tags:
 *
 *     <details>
 *     <summary>What is a monad?</summary>
 *
 *     A monoid in the category of endofunctors.
 *
 *     </details>
 *
 * Whether a toggle is open is only a view state and never written.
 */
const OPENING = /^<details>[ \t]*\r?\n<summary>([^\n]*?)<\/summary>[ \t]*\r?\n/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The line index of the `</details>` closing a toggle whose body starts at line 0. */
function closingLine(lines: string[]): number {
  let depth = 1;
  let fence: string | null = null;
  for (const [index, line] of lines.entries()) {
    // Tags quoted in a code block belong to the code.
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) fence = marker;
    else if (/^<details>[ \t]*\r?$/.test(line)) depth += 1;
    else if (/^<\/details>[ \t]*\r?$/.test(line) && (depth -= 1) === 0) return index;
  }
  return -1;
}

const tokenizer: MarkdownTokenizer = {
  name: 'details',
  level: 'block',
  start: lineStart(/<details>/),
  tokenize(src, _tokens, lexer) {
    const opening = OPENING.exec(src);
    if (!opening) return;
    const rest = src.slice(opening[0].length);
    const lines = rest.split('\n');
    const end = closingLine(lines);
    if (end < 0) return;
    const through = lines.slice(0, end + 1).join('\n');
    return {
      type: 'details',
      raw: opening[0] + through + (rest.length > through.length ? '\n' : ''),
      summary: lexer.inlineTokens(opening[1]!.trim()),
      tokens: lexer.blockTokens(lines.slice(0, end).join('\n').trim()),
    };
  },
};

// The summary and content are written by the toggle itself. Their stock
// `:::detailsSummary` containers must not claim text that only looks like one.
const noTokenizer = (name: string): MarkdownTokenizer => ({
  name,
  level: 'block',
  start: () => -1,
  tokenize: () => undefined,
});

export const NoteDetails = Details.extend({
  markdownTokenizer: tokenizer,
  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    const summary = helpers.parseInline((token.summary as typeof token.tokens) ?? []);
    return helpers.createNode('details', {}, [
      helpers.createNode('detailsSummary', {}, summary),
      helpers.createNode('detailsContent', {}, content.length ? content : [{ type: 'paragraph' }]),
    ]);
  },
  renderMarkdown(node, helpers) {
    const summary = node.content?.find((child) => child.type === 'detailsSummary');
    const content = node.content?.find((child) => child.type === 'detailsContent');
    // One line: a line break would end the summary for other Markdown readers.
    const title = helpers
      .renderChildren(summary?.content ?? [])
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    const body = helpers.renderChildren(content?.content ?? [], '\n\n').trim();
    return `<details>\n<summary>${title}</summary>\n\n${body}\n\n</details>`;
  },
}).configure({
  renderToggleButton: ({ element, isOpen }) => {
    element.setAttribute('aria-label', isOpen ? 'Hide content' : 'Show content');
    element.setAttribute('aria-expanded', String(isOpen));
  },
});

export const NoteDetailsSummary = DetailsSummary.extend({
  // Formulas are welcome in a question; line breaks are not.
  content: '(text | inlineMath)*',
  markdownTokenizer: noTokenizer('detailsSummary'),
});

export const NoteDetailsContent = DetailsContent.extend({
  markdownTokenizer: noTokenizer('detailsContent'),
});

/** Toggle, summary and content: the three nodes a toggle needs in the schema. */
export const noteDetailsExtensions = [NoteDetails, NoteDetailsSummary, NoteDetailsContent];

export function createToggle(summary = '', content: JSONContent[] = []): JSONContent {
  return {
    type: 'details',
    content: [
      {
        type: 'detailsSummary',
        ...(summary ? { content: [{ type: 'text', text: summary }] } : {}),
      },
      { type: 'detailsContent', content: content.length ? content : [{ type: 'paragraph' }] },
    ],
  };
}

/** Inserts an empty toggle after the current block and puts the cursor in its summary. */
export function insertToggle(editor: Editor) {
  if (!editor.isEditable) return false;
  const { from, to: end } = blockInsertionRange(editor);
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to: end }, [createToggle(), { type: 'paragraph' }])
    .setTextSelection(from + 2)
    .run();
}
