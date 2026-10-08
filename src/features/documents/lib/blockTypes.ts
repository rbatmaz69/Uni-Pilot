import type { ChainedCommands, Editor, Range } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { DrawingPresetId } from './drawingPresets';
import { insertNoteVisual } from './noteVisuals';
import { createMermaidBlock } from './mermaid';
import { insertFormula } from './noteMath';
import { insertToggle } from './noteDetails';
import { insertFootnote } from './noteFootnotes';

/**
 * The block types a paragraph can be turned into, shared by the selection
 * menu's "Turn into" list and the `/` menu so both always offer the same set.
 * Every one of them is plain Markdown; `hint` is how it is written in the file.
 */
export type BlockTypeId =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock';

export interface BlockType {
  id: BlockTypeId;
  label: string;
  hint: string;
  keywords: string[];
  isActive: (editor: Editor) => boolean;
  /** Applied after `clearNodes`, which turns the block back into a plain paragraph. */
  apply: (chain: ChainedCommands) => ChainedCommands;
}

const WRAPPERS = ['bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'] as const;

export const BLOCK_TYPES: BlockType[] = [
  {
    id: 'paragraph',
    label: 'Text',
    hint: 'Plain paragraph',
    keywords: ['paragraph', 'body', 'plain'],
    isActive: (editor) =>
      editor.isActive('paragraph') && !WRAPPERS.some((name) => editor.isActive(name)),
    apply: (chain) => chain,
  },
  ...([1, 2, 3] as const).map((level): BlockType => ({
    id: `heading${level}`,
    label: `Heading ${level}`,
    hint: `${'#'.repeat(level)} `,
    keywords: [`h${level}`, 'title', 'heading', ...(level === 1 ? ['big'] : [])],
    isActive: (editor) => editor.isActive('heading', { level }),
    apply: (chain) => chain.setNode('heading', { level }),
  })),
  {
    id: 'bulletList',
    label: 'Bulleted list',
    hint: '- ',
    keywords: ['bullet', 'unordered', 'ul', 'list'],
    isActive: (editor) => editor.isActive('bulletList'),
    apply: (chain) => chain.toggleBulletList(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    hint: '1. ',
    keywords: ['number', 'ordered', 'ol', 'list', 'steps'],
    isActive: (editor) => editor.isActive('orderedList'),
    apply: (chain) => chain.toggleOrderedList(),
  },
  {
    id: 'taskList',
    label: 'Checklist',
    hint: '- [ ] ',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    isActive: (editor) => editor.isActive('taskList'),
    apply: (chain) => chain.toggleTaskList(),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    hint: '> ',
    keywords: ['blockquote', 'citation', 'cite'],
    isActive: (editor) => editor.isActive('blockquote'),
    apply: (chain) => chain.toggleBlockquote(),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    hint: '```',
    keywords: ['code', 'snippet', 'program', 'pre'],
    isActive: (editor) => editor.isActive('codeBlock'),
    apply: (chain) => chain.toggleCodeBlock(),
  },
];

export function activeBlockType(editor: Editor): BlockType {
  // Paragraph is checked last: a list item's text is a paragraph too.
  return (
    BLOCK_TYPES.find((type) => type.id !== 'paragraph' && type.isActive(editor)) ??
    (BLOCK_TYPES[0] as BlockType)
  );
}

/** Turns the selected blocks into `type`, first lifting them out of any list or quote. */
export function turnInto(editor: Editor, type: BlockType, range?: Range) {
  let chain = editor.chain().focus(undefined, { scrollIntoView: false });
  if (range) chain = chain.deleteRange(range);
  type.apply(chain.clearNodes()).run();
}

export type SlashGroup = 'Blocks' | 'Insert';
export interface SlashCommand {
  id:
    | BlockTypeId
    | 'divider'
    | 'table'
    | 'image'
    | 'mermaid'
    | 'formula'
    | 'inlineFormula'
    | 'toggle'
    | 'footnote'
    | DrawingPresetId;
  label: string;
  hint: string;
  keywords: string[];
  group: SlashGroup;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  ...BLOCK_TYPES.map(({ id, label, hint, keywords }) => ({
    id,
    label,
    hint,
    keywords,
    group: 'Blocks' as const,
  })),
  {
    id: 'formula',
    label: 'Formula',
    hint: '$$ LaTeX $$ on its own line',
    keywords: ['math', 'equation', 'latex', 'katex', 'formel', 'gleichung'],
    group: 'Insert',
  },
  {
    id: 'inlineFormula',
    label: 'Inline formula',
    hint: '$x^2$ inside the line',
    keywords: ['math', 'equation', 'latex', 'katex', 'formel'],
    group: 'Insert',
  },
  {
    id: 'toggle',
    label: 'Toggle',
    hint: 'Hides its content until opened',
    keywords: ['details', 'collapse', 'fold', 'question', 'answer', 'aufklappen'],
    group: 'Insert',
  },
  {
    id: 'footnote',
    label: 'Footnote',
    hint: '[^1] with a note at the end',
    keywords: ['reference', 'citation', 'source', 'fußnote', 'quelle'],
    group: 'Insert',
  },
  {
    id: 'mermaid',
    label: 'Mermaid diagram',
    hint: 'Code with a live diagram preview',
    keywords: ['mermaid', 'diagram', 'flowchart', 'sequence', 'mindmap'],
    group: 'Insert',
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: '---',
    keywords: ['rule', 'line', 'separator', 'hr'],
    group: 'Insert',
  },
  {
    id: 'table',
    label: 'Table',
    hint: '| a | b |',
    keywords: ['grid', 'columns', 'rows'],
    group: 'Insert',
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Saved in attachments/',
    keywords: ['picture', 'photo', 'screenshot', 'img'],
    group: 'Insert',
  },
  ...(
    [
      ['sticky-yellow', 'Sticky note', ['sticky', 'card', 'haftnotiz']],
      ['rectangle', 'Rectangle', ['shape', 'form', 'box']],
      ['ellipse', 'Circle', ['shape', 'ellipse', 'form']],
      ['diamond', 'Diamond', ['shape', 'decision', 'form']],
      ['arrow', 'Arrow', ['shape', 'pfeil']],
      ['study-card', 'Study card', ['question', 'answer', 'flashcard']],
      ['flow', 'Flow', ['diagram', 'process', 'steps']],
      ['compare', 'Compare', ['columns', 'comparison']],
      ['cornell', 'Cornell notes', ['summary', 'cues']],
      ['study-board', 'Study board', ['kanban', 'learning']],
      ['mind-map', 'Mind map', ['ideas', 'map', 'brainstorm']],
    ] as [DrawingPresetId, string, string[]][]
  ).map(([id, label, keywords]) => ({
    id,
    label,
    keywords,
    hint: 'Editable on this page',
    group: 'Insert' as const,
  })),
];

/**
 * Commands matching what was typed after `/`, best first: a label that starts
 * with the query, then one containing it, then a keyword.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_COMMANDS;
  const rank = (command: SlashCommand) => {
    const label = command.label.toLowerCase();
    if (label.startsWith(needle)) return 0;
    if (label.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
    if (label.includes(needle)) return 2;
    if (command.keywords.some((keyword) => keyword.startsWith(needle))) return 3;
    return -1;
  };
  return SLASH_COMMANDS.map((command) => ({ command, score: rank(command) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score)
    .map(({ command }) => command);
}

/**
 * Runs a `/` command, replacing the typed `/query`. Images need a file
 * picker, which the host opens through `insertImage`.
 */
export function runSlashCommand(
  editor: Editor,
  range: Range,
  command: SlashCommand,
  insertImage: () => void,
) {
  if (!editor.isEditable) return;
  const type = BLOCK_TYPES.find((block) => block.id === command.id);
  if (type) return turnInto(editor, type, range);
  const chain = editor.chain().focus().deleteRange(range);
  if (command.id === 'divider') chain.setHorizontalRule().run();
  else if (command.id === 'table')
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  else if (command.id === 'image') {
    chain.run();
    insertImage();
  } else if (command.id === 'formula' || command.id === 'inlineFormula') {
    chain.run();
    insertFormula(editor, command.id === 'formula');
  } else if (command.id === 'toggle') {
    chain.run();
    insertToggle(editor);
  } else if (command.id === 'footnote') {
    // The `/` needed a space before it; the reference belongs right after the word.
    const before = editor.state.doc.textBetween(Math.max(0, range.from - 2), range.from);
    if (/\S $/.test(before)) chain.deleteRange({ from: range.from - 1, to: range.from });
    chain.run();
    insertFootnote(editor);
  } else if (command.id === 'mermaid') {
    chain
      .insertContent([createMermaidBlock(), { type: 'paragraph' }])
      .command(({ tr }) => {
        let position: number | null = null;
        tr.doc.descendants((node, pos) => {
          if (
            pos >= range.from - 1 &&
            pos <= tr.selection.from &&
            node.type.name === 'codeBlock' &&
            node.attrs.language === 'mermaid'
          )
            position = pos + 1;
        });
        if (position !== null) tr.setSelection(TextSelection.create(tr.doc, position));
        return true;
      })
      .run();
  } else {
    chain.run();
    insertNoteVisual(editor, command.id as DrawingPresetId);
  }
}

/**
 * Opens the `/` menu from the page rail's "+": on the empty line the cursor is
 * in, or in a new paragraph after the block it is in, like Notion's block "+".
 */
export function openBlockMenu(editor: Editor) {
  const { $from } = editor.state.selection;
  const block = $from.parent;
  if (block.type.name === 'paragraph' && block.content.size === 0) {
    editor.chain().focus().insertContent('/').run();
    return;
  }
  // After the top-level block, so a list or quote is not split in two.
  const after = $from.depth > 0 ? $from.after(1) : editor.state.doc.content.size;
  editor
    .chain()
    .focus()
    .insertContentAt(after, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
    .setTextSelection(after + 2)
    .run();
}
