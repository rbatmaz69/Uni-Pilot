import { generateHTML, type AnyExtension, type JSONContent } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableKit, TableView } from '@tiptap/extension-table';
import Underline from '@tiptap/extension-underline';
import { CharacterCount } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { NoteCard, NoteLayout } from './noteVisuals';
import { NoteCodeBlock } from './noteCodeBlock';
import { NoteBlockMath, NoteInlineMath, opensFormula } from './noteMath';
import { noteDetailsExtensions } from './noteDetails';
import { FootnoteDefinition, FootnoteReference } from './noteFootnotes';

/**
 * Markdown is the file format, so every edit is a parse → edit → serialise
 * round trip through @tiptap/markdown. Its serialiser leaves three gaps that
 * silently change a student's notes on the next save; this module closes them
 * and is pinned down by `markdown.test.ts`, which fails loudly if an upgrade
 * changes the behaviour underneath:
 *
 * 1. A paragraph that merely *starts* like block syntax (`1. Semester`, `- `,
 *    `# `, `---`) comes back as a list, heading or rule.
 * 2. Bare URLs get backslashes inside them (`c\_d`), which the GFM autolinker
 *    then bakes into the link target.
 * 3. `&` and `<` are always written as entities, so raw files read
 *    `Tom &amp; Jerry` in every other editor.
 * 4. A `$` in text could open a formula once the note is read again.
 */

const WORD_CHARACTER = /[\p{L}\p{N}]/u;
// Only these sequences would be read back as an entity or an HTML tag.
const ENTITY_LIKE = /&#?[a-z0-9]+;/iy;
const TAG_LIKE = /<[a-z!/?]/iy;
const ALWAYS_ESCAPED = new Set(['\\', '`', '*', '[', ']', '~']);
const BARE_URL = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
// GFM leaves these out of an autolink when they end it.
const URL_TRAILING_PUNCTUATION = /[?!.,:*_~]+$/u;
// Stands for markup written right after a text run: neither a space nor a word character.
const OTHER_SYNTAX = '\uFFFC';

function escapeInline(text: string, after: string): string {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const previous = text.charAt(index - 1);
    const next = index + 1 < text.length ? text.charAt(index + 1) : after;
    ENTITY_LIKE.lastIndex = index;
    TAG_LIKE.lastIndex = index;
    if (ALWAYS_ESCAPED.has(character)) result += `\\${character}`;
    // An underscore between two word characters can neither open nor close
    // emphasis, so `snake_case` stays readable in the file.
    else if (character === '_')
      result += WORD_CHARACTER.test(previous) && WORD_CHARACTER.test(next) ? '_' : '\\_';
    // `==` is the highlight delimiter; `a == b` must not turn into a highlight.
    else if (character === '=' && (previous === '=' || next === '=')) result += '\\=';
    else if (character === '&' && ENTITY_LIKE.test(text)) result += '&amp;';
    else if (character === '<' && TAG_LIKE.test(text)) result += '&lt;';
    else result += character;
  }
  return result;
}

/**
 * The first `$` in escaped Markdown that would be read as the start of a
 * formula. Only one that closes within the run, or that whatever follows
 * could close, counts — so `5 $ and 10 $` or `$5 and $10` stay readable.
 */
function openingDollar(markdown: string, after: string): number {
  for (let index = 0; index < markdown.length; index += 1) {
    const character = markdown.charAt(index);
    if (character === '\\') index += 1;
    else if (character === '$') {
      const rest = markdown.slice(index);
      if (opensFormula(rest)) return index;
      // A formula never spans a line break, but it could close in a mark or node that follows.
      if (after && after !== '\n' && /^\$(?![\s$])/.test(rest)) return index;
    }
  }
  return -1;
}

function escapeDollars(markdown: string, after: string): string {
  let result = markdown;
  // Each pass escapes one more `$`, whose neighbours may then read differently.
  for (let index = openingDollar(result, after); index >= 0; index = openingDollar(result, after))
    result = `${result.slice(0, index)}\\${result.slice(index)}`;
  return result;
}

/**
 * Escapes a text run so that parsing the result yields exactly `text` again.
 * `after` is the character written right after the run: `''` at the end of the
 * block, and any non-space character when something else follows directly.
 */
export function escapeMarkdownText(
  text: string,
  { inLink = false, after = '' }: { inLink?: boolean; after?: string } = {},
): string {
  const escape = (part: string, next: string) => escapeDollars(escapeInline(part, next), next);
  // Link text is not autolinked, so it takes the ordinary escaping.
  if (inLink) return escape(text, after);
  let result = '';
  let consumed = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const url = match[0].replace(URL_TRAILING_PUNCTUATION, '');
    if (!url) continue;
    result += escape(text.slice(consumed, match.index), OTHER_SYNTAX) + url;
    consumed = match.index + url.length;
  }
  return result + escape(text.slice(consumed), after);
}

/**
 * What follows a text node in its block, as `escapeMarkdownText` expects it.
 * A neighbouring text node always differs in its marks, so a delimiter may come
 * first; like a formula or an image, it counts as some other syntax.
 */
function characterAfter(node: JSONContent, parentNode?: JSONContent): string {
  const siblings = parentNode?.content ?? [];
  const next = siblings[siblings.indexOf(node) + 1];
  if (!next) return '';
  return next.type === 'hardBreak' ? '\n' : OTHER_SYNTAX;
}

function escapeLineStart(line: string, first: boolean): string {
  const indent = /^ {0,3}/.exec(line)?.[0] ?? '';
  const rest = line.slice(indent.length);
  if (/^:{3,}note(?:Card|Layout)(?:[ \t]|$)/.test(rest))
    return `${indent}${rest.replace(/:(?=note(?:Card|Layout))/, '\\:')}`;
  // Text writes `\[`, so this is a footnote reference that starts the line; a
  // colon after it would turn the paragraph into the footnote's definition.
  const reference = /^\[\^[^\]\s^]+\]:/.exec(rest);
  if (reference)
    return `${indent}${reference[0].slice(0, -1)}\\:${rest.slice(reference[0].length)}`;
  // `$$` would start a block formula (see noteMath.ts), even after a line break.
  if (/^(?:#{1,6}|[-+])(?:[ \t]|$)/.test(rest) || /^(?:>|\$\$)/.test(rest))
    return `${indent}\\${rest}`;
  const ordered = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(rest);
  if (ordered) return `${indent}${ordered[1]}\\${ordered[2]}${rest.slice(ordered[0].length)}`;
  // `---` alone is a rule; after a line break, `---` or `===` underlines it into a heading.
  if (/^(?:-[ \t]*){3,}$/.test(rest) || (!first && /^(?:=+|-+)[ \t]*$/.test(rest)))
    return `${indent}\\${rest}`;
  return line;
}

/** Escapes the start of every line of a paragraph so it stays a paragraph. */
export function escapeBlockStarts(markdown: string): string {
  return markdown
    .split('\n')
    .map((line, index) =>
      // Leading spaces carry no meaning in a paragraph, but four of them would
      // start an indented code block.
      index === 0
        ? escapeLineStart(line.replace(/^[ \t]+/, ''), true)
        : escapeLineStart(line, false),
    )
    .join('\n');
}

type TextEncoder = (text: string, node: JSONContent, parentNode?: JSONContent) => string;

const SafeMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    const manager = this.storage.manager as unknown as { encodeTextForMarkdown: TextEncoder };
    const encode = manager.encodeTextForMarkdown.bind(manager);
    manager.encodeTextForMarkdown = (text, node, parentNode) => {
      // The stock encoder returns text untouched inside code; ask it rather
      // than duplicating its list of code node and mark types.
      if (encode('<', node, parentNode) === '<') return text;
      const inLink = (node.marks ?? []).some((mark) => mark.type === 'link');
      return escapeMarkdownText(text, { inLink, after: characterAfter(node, parentNode) });
    };
  },
});

const SafeParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    return escapeBlockStarts(Paragraph.config.renderMarkdown?.(node, helpers, context) ?? '');
  },
});

// A private-use character stands in for `|` while the stock renderer runs, so
// the pipe escape is added after text escaping instead of being escaped itself.
const PIPE_PLACEHOLDER = String.fromCharCode(0xe000);
const TABLE_VARIANTS = ['grid', 'soft', 'striped', 'minimal'] as const;
const TABLE_DENSITIES = ['compact', 'normal', 'spacious'] as const;
const TABLE_TONES = ['neutral', 'blue', 'green', 'yellow', 'orange', 'pink', 'lavender'] as const;
const CELL_INKS = ['default', 'blue', 'green', 'rose'] as const;

function tableChoice(value: string | null, choices: readonly string[], fallback: string) {
  return value && choices.includes(value) ? value : fallback;
}

const tableAttributes = {
  variant: {
    default: 'grid',
    parseHTML: (element: HTMLElement) =>
      tableChoice(element.getAttribute('data-note-table-variant'), TABLE_VARIANTS, 'grid'),
    renderHTML: (attributes: Record<string, string>) => ({
      'data-note-table-variant': attributes.variant,
    }),
  },
  density: {
    default: 'normal',
    parseHTML: (element: HTMLElement) =>
      tableChoice(element.getAttribute('data-note-table-density'), TABLE_DENSITIES, 'normal'),
    renderHTML: (attributes: Record<string, string>) => ({
      'data-note-table-density': attributes.density,
    }),
  },
  tone: {
    default: 'neutral',
    parseHTML: (element: HTMLElement) =>
      tableChoice(element.getAttribute('data-note-table-tone'), TABLE_TONES, 'neutral'),
    renderHTML: (attributes: Record<string, string>) => ({
      'data-note-table-tone': attributes.tone,
    }),
  },
};

const cellVisualAttributes = {
  tone: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const tone = element.getAttribute('data-note-cell-tone');
      return tone && TABLE_TONES.includes(tone as (typeof TABLE_TONES)[number]) ? tone : null;
    },
    renderHTML: (attributes: Record<string, string | null>) =>
      attributes.tone ? { 'data-note-cell-tone': attributes.tone } : {},
  },
  ink: {
    default: 'default',
    parseHTML: (element: HTMLElement) =>
      tableChoice(element.getAttribute('data-note-cell-ink'), CELL_INKS, 'default'),
    renderHTML: (attributes: Record<string, string>) =>
      attributes.ink === 'default' ? {} : { 'data-note-cell-ink': attributes.ink },
  },
};

const StyledTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellVisualAttributes };
  },
});

const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellVisualAttributes };
  },
});

/** TableView handles resizing but does not refresh custom node attributes on updates. */
class StyledTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.syncAppearance(node);
  }

  update(node: ProseMirrorNode) {
    if (!super.update(node)) return false;
    this.syncAppearance(node);
    return true;
  }

  private syncAppearance(node: ProseMirrorNode) {
    this.table.dataset.noteTableVariant = String(node.attrs.variant ?? 'grid');
    this.table.dataset.noteTableDensity = String(node.attrs.density ?? 'normal');
    this.table.dataset.noteTableTone = String(node.attrs.tone ?? 'neutral');
  }
}

function markPipes(node: JSONContent): JSONContent {
  const latex: unknown = node.attrs?.latex;
  return {
    ...node,
    ...(node.text === undefined ? {} : { text: node.text.replaceAll('|', PIPE_PLACEHOLDER) }),
    ...(node.type === 'inlineMath' && typeof latex === 'string'
      ? { attrs: { ...node.attrs, latex: latex.replaceAll('|', PIPE_PLACEHOLDER) } }
      : {}),
    ...(node.content ? { content: node.content.map(markPipes) } : {}),
  };
}

// GFM splits a row at every unescaped pipe, even inside code spans and
// formulas like `$P(A|B)$`, so `a | b` in a cell would otherwise shift the
// rest of the row into new columns.
const SafeTable = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tableAttributes };
  },
  renderMarkdown(node, helpers, context) {
    const alignments = new Map<number, string | null>();
    const mixedAlignment = node.content?.some((row) =>
      row.content?.some((cell, column) => {
        const rawAlign: unknown = cell.attrs?.align;
        const align = typeof rawAlign === 'string' ? rawAlign : null;
        if (!alignments.has(column)) alignments.set(column, align);
        return alignments.get(column) !== align;
      }),
    );
    const mixedHeaderRow =
      node.content?.[0]?.content?.some((cell) => cell.type === 'tableHeader') &&
      node.content?.[0]?.content?.some((cell) => cell.type === 'tableCell');
    const styled =
      node.attrs?.variant !== 'grid' ||
      node.attrs?.density !== 'normal' ||
      node.attrs?.tone !== 'neutral' ||
      mixedAlignment ||
      mixedHeaderRow ||
      node.content?.some((row, rowIndex) =>
        row.content?.some(
          (cell) =>
            cell.attrs?.tone ||
            cell.attrs?.ink !== 'default' ||
            cell.attrs?.colspan !== 1 ||
            cell.attrs?.rowspan !== 1 ||
            cell.attrs?.colwidth ||
            (rowIndex > 0 && cell.type === 'tableHeader') ||
            cell.content?.length !== 1 ||
            cell.content[0]?.type !== 'paragraph',
        ),
      );
    // GFM cannot express fills, merged cells, widths, header columns or a
    // table's appearance. HTML is valid Markdown and keeps these editable.
    if (styled) return `\n${generateHTML({ type: 'doc', content: [node] }, noteExtensions())}\n`;
    const markdown = Table.config.renderMarkdown?.(markPipes(node), helpers, context) ?? '';
    return markdown.replaceAll(PIPE_PLACEHOLDER, '\\|');
  },
});

// `++text++` is not Markdown most apps understand; `<u>` renders everywhere.
const PortableUnderline = Underline.extend({
  renderMarkdown(node, helpers) {
    return `<u>${helpers.renderChildren(node)}</u>`;
  },
});

interface NoteExtensionOptions {
  /** Replaces the plain image node, e.g. with one that resolves attachments. */
  image?: AnyExtension;
  placeholder?: string;
  card?: AnyExtension;
  layout?: AnyExtension;
  codeBlock?: AnyExtension;
  /** Replace the formulas' KaTeX output with views that edit their LaTeX. */
  inlineMath?: AnyExtension;
  blockMath?: AnyExtension;
}

/**
 * The note schema. Everything in it must survive a Markdown round trip — an
 * unknown construct is dropped on save. Styled tables use HTML inside the
 * Markdown file when GFM cannot represent their appearance or structure.
 */
export function noteExtensions({
  image,
  placeholder,
  card,
  layout,
  codeBlock,
  inlineMath,
  blockMath,
}: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({ paragraph: false, underline: false, codeBlock: false }),
    codeBlock ?? NoteCodeBlock,
    SafeParagraph,
    PortableUnderline,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
    SafeTable.configure({ resizable: true, cellMinWidth: 80, View: StyledTableView }),
    StyledTableCell,
    StyledTableHeader,
    image ?? Image.configure({ allowBase64: true }),
    card ?? NoteCard,
    layout ?? NoteLayout,
    inlineMath ?? NoteInlineMath,
    blockMath ?? NoteBlockMath,
    ...noteDetailsExtensions,
    FootnoteReference,
    FootnoteDefinition,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    CharacterCount,
    SafeMarkdown,
  ];
}

// YAML front matter (Obsidian properties) is kept verbatim outside the editor:
// the editor would otherwise read its fences as rules and its keys as a heading.
const FRONT_MATTER =
  /^---\r?\n[\w-][^\n:]*:[^\n]*\r?\n(?:[^\n]*\r?\n)*?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(markdown: string): { frontMatter: string; body: string } {
  const match = FRONT_MATTER.exec(markdown);
  if (!match) return { frontMatter: '', body: markdown };
  return { frontMatter: match[0], body: markdown.slice(match[0].length) };
}

/** Joins preserved front matter and a serialised body into the file's text. */
export function composeNote(frontMatter: string, body: string): string {
  const content = body.replace(/^\n+/, '').replace(/\s+$/, '');
  const text = content ? `${content}\n` : '';
  if (!frontMatter) return text;
  const head = frontMatter.endsWith('\n') ? frontMatter : `${frontMatter}\n`;
  return text ? `${head}\n${text}` : head;
}

const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi;
const ORDERED_MARKER = /^([ \t>]*)\d{1,9}(?=[.)](?:[ \t]|$))/gm;
const TASK_MARKER = /^([ \t>]*[-+*][ \t]+)\[[ xX]\]/gm;

function characterCounts(markdown: string) {
  const counts = new Map<string, number>();
  // Renumbered lists, `[X]` boxes and entity spelling change characters
  // without changing what the note says.
  const text = markdown
    .replace(ENTITY, ' ')
    .replace(ORDERED_MARKER, '$1')
    .replace(TASK_MARKER, '$1');
  for (const character of text.match(/[\p{L}\p{N}]/gu) ?? [])
    counts.set(character, (counts.get(character) ?? 0) + 1);
  return counts;
}

/**
 * Letters and digits that would disappear if `original` were opened and saved.
 * Formatting may be normalised on save, but text must never vanish — e.g. raw
 * HTML blocks or comments, which the editor cannot represent.
 */
export function findContentLoss(original: string, serialized: string): string[] {
  const after = characterCounts(serialized);
  return [...characterCounts(original)]
    .filter(([character, count]) => (after.get(character) ?? 0) < count)
    .map(([character]) => character);
}
