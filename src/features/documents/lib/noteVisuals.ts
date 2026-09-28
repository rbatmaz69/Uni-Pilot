import {
  Node,
  mergeAttributes,
  type Editor,
  type JSONContent,
  type MarkdownTokenizer,
} from '@tiptap/core';
import type { DrawingPresetId } from './drawingPresets';
import { lineStart } from './markdownTokens';

export const CARD_TONES = ['yellow', 'peach', 'mint', 'blue', 'paper'] as const;
export const CARD_SHAPES = [
  'sticky',
  'rectangle',
  'ellipse',
  'diamond',
  'arrow',
  'study-card',
] as const;
export const NOTE_LAYOUTS = ['flow', 'compare', 'cornell', 'study-board', 'mind-map'] as const;
export const NOTE_ALIGNMENTS = ['left', 'center', 'right'] as const;
export const NOTE_SIZE_LIMITS = { width: [180, 1600], height: [100, 2000] } as const;
type Tone = (typeof CARD_TONES)[number];
type Shape = (typeof CARD_SHAPES)[number];

export function noteDimension(value: unknown, dimension: 'width' | 'height'): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  const [minimum, maximum] = NOTE_SIZE_LIMITS[dimension];
  return Number.isFinite(number) ? Math.round(Math.min(maximum, Math.max(minimum, number))) : null;
}

function objectAttributes() {
  return {
    width: {
      default: null,
      parseHTML: (el: HTMLElement) => noteDimension(el.dataset.noteWidth, 'width'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.width === null ? {} : { 'data-note-width': attrs.width },
    },
    height: {
      default: null,
      parseHTML: (el: HTMLElement) => noteDimension(el.dataset.noteHeight, 'height'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.height === null ? {} : { 'data-note-height': attrs.height },
    },
    align: {
      default: 'left',
      parseHTML: (el: HTMLElement) =>
        NOTE_ALIGNMENTS.find((v) => v === el.dataset.noteAlign) ?? 'left',
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-note-align': attrs.align }),
    },
  };
}

function objectMarkdown(attrs: Record<string, unknown> = {}) {
  return [
    ...(['width', 'height'] as const).flatMap((key) =>
      attrs[key] == null ? [] : [`${key}=${noteDimension(attrs[key], key)}`],
    ),
    ...(typeof attrs.align === 'string' && attrs.align !== 'left' ? [`align=${attrs.align}`] : []),
  ];
}

function objectHTML(attrs: Record<string, unknown>) {
  const width = noteDimension(attrs.width, 'width');
  const height = noteDimension(attrs.height, 'height');
  return {
    style: [
      width ? `width:${width}px;max-width:100%` : '',
      height ? `--note-object-height:${height}px` : '',
    ]
      .filter(Boolean)
      .join(';'),
  };
}

// Longer fences surround nested containers and literal fences in code. The
// content remains ordinary readable Markdown, including links and attachments.
function container(name: string, attributes: string[], content: string) {
  const longest = Math.max(2, ...Array.from(content.matchAll(/^(:{3,})/gm), (m) => m[1]!.length));
  const fence = ':'.repeat(longest + 1);
  return `${fence}${name} ${attributes.join(' ')}\n${content}\n${fence}`;
}

function tokenizer(
  name: string,
  keys: string[],
  choices: readonly (readonly string[])[],
): MarkdownTokenizer {
  return {
    name,
    level: 'block',
    start: lineStart(new RegExp(`:{3,}${name} `)),
    tokenize(src, _tokens, lexer) {
      const header = new RegExp(`^(:{3,})${name} ([a-z0-9= -]+)\\r?\\n`).exec(src);
      if (!header) return;
      const values = header[2]!.split(' ');
      if (values.length < keys.length || keys.some((_key, i) => !choices[i]?.includes(values[i]!)))
        return;
      const attributes: Record<string, unknown> = Object.fromEntries(
        keys.map((key, i) => [key, values[i]]),
      );
      const seen = new Set<string>();
      for (const value of values.slice(keys.length)) {
        const [key, setting] = value.split('=');
        if (!key || !setting || seen.has(key)) return;
        seen.add(key);
        if (
          key === 'align' &&
          NOTE_ALIGNMENTS.includes(setting as (typeof NOTE_ALIGNMENTS)[number])
        )
          attributes.align = setting;
        else if ((key === 'width' || key === 'height') && /^\d+$/.test(setting))
          attributes[key] = noteDimension(setting, key);
        else return;
      }
      const body = src.slice(header[0].length);
      const end = new RegExp(`^${header[1]}[ \\t]*(?:\\r?\\n|$)`, 'm').exec(body);
      if (!end) return;
      const text = body.slice(0, end.index).replace(/\r?\n$/, '');
      return {
        type: name,
        raw: src.slice(0, header[0].length + end.index + end[0].length),
        attributes,
        tokens: lexer.blockTokens(text),
      };
    },
  };
}

export const NoteCard = Node.create({
  name: 'noteCard',
  priority: 1000,
  group: 'block',
  content:
    '(paragraph | heading | bulletList | orderedList | taskList | blockquote | codeBlock | horizontalRule | image | table | blockMath)+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes() {
    return {
      ...objectAttributes(),
      shape: {
        default: 'sticky',
        parseHTML: (el) => CARD_SHAPES.find((v) => v === el.dataset.noteShape) ?? 'sticky',
      },
      tone: {
        default: 'yellow',
        parseHTML: (el) => CARD_TONES.find((v) => v === el.dataset.noteTone) ?? 'yellow',
      },
    };
  },
  parseHTML: () => [{ tag: 'section[data-note-card]' }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-note-card': '',
        'data-note-shape': String(node.attrs.shape),
        'data-note-tone': String(node.attrs.tone),
        class: 'note-visual-card',
        ...objectHTML(node.attrs),
      }),
      ['div', { class: 'note-visual-card-body' }, 0],
    ];
  },
  markdownTokenizer: tokenizer('noteCard', ['shape', 'tone'], [CARD_SHAPES, CARD_TONES]),
  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      'noteCard',
      token.attributes,
      content.length ? content : [{ type: 'paragraph' }],
    );
  },
  renderMarkdown(node, helpers) {
    return container(
      'noteCard',
      [
        String(node.attrs?.shape ?? 'sticky'),
        String(node.attrs?.tone ?? 'yellow'),
        ...objectMarkdown(node.attrs),
      ],
      helpers.renderChildren(node.content ?? [], '\n\n'),
    );
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (!this.editor.isActive('noteCard')) return false;
        const { $from } = this.editor.state.selection;
        const after = $from.after(1);
        return this.editor
          .chain()
          .insertContentAt(after, { type: 'paragraph' })
          .setTextSelection(after + 1)
          .run();
      },
    };
  },
});

export const NoteLayout = Node.create({
  name: 'noteLayout',
  group: 'block',
  content: 'noteCard+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes() {
    return {
      ...objectAttributes(),
      layout: {
        default: 'compare',
        parseHTML: (el) => NOTE_LAYOUTS.find((v) => v === el.dataset.noteLayout) ?? 'compare',
      },
    };
  },
  parseHTML: () => [{ tag: 'section[data-note-layout]' }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-note-layout': String(node.attrs.layout),
        class: 'note-visual-layout',
        ...objectHTML(node.attrs),
      }),
      ['div', { class: 'note-visual-layout-body' }, 0],
    ];
  },
  markdownTokenizer: tokenizer('noteLayout', ['layout'], [NOTE_LAYOUTS]),
  parseMarkdown(token, helpers) {
    const children = helpers.parseChildren(token.tokens ?? []);
    // Keep unexpected text too, rather than silently losing it on a save.
    return helpers.createNode(
      'noteLayout',
      token.attributes,
      children.length
        ? children.map((child) =>
            child.type === 'noteCard' ? child : { type: 'noteCard', content: [child] },
          )
        : [card('', 'paper')],
    );
  },
  renderMarkdown(node, helpers) {
    return container(
      'noteLayout',
      [String(node.attrs?.layout ?? 'compare'), ...objectMarkdown(node.attrs)],
      helpers.renderChildren(node.content ?? [], '\n\n'),
    );
  },
});

function card(text: string, tone: Tone, shape: Shape = 'sticky'): JSONContent {
  return {
    type: 'noteCard',
    attrs: { shape, tone },
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

export function createNoteVisual(id: DrawingPresetId): JSONContent {
  if (id.startsWith('sticky-')) return card('Write an idea…', id.slice(7) as Tone);
  if (id === 'study-card') return card('Question\nWrite the answer…', 'paper', 'study-card');
  if (id === 'rectangle' || id === 'ellipse' || id === 'diamond' || id === 'arrow')
    return card('Your text', 'blue', id);
  const content =
    id === 'flow'
      ? [
          card('Start', 'blue', 'rectangle'),
          card('Key idea', 'yellow', 'rectangle'),
          card('Result', 'mint', 'rectangle'),
        ]
      : id === 'compare'
        ? [card('Option A\nAdd your notes…', 'blue'), card('Option B\nAdd your notes…', 'yellow')]
        : id === 'cornell'
          ? [
              card('Cues & questions\nKey terms…', 'blue'),
              card('Main notes\nCapture the lesson…', 'paper'),
              card('Summary\nExplain it in your own words…', 'yellow'),
            ]
          : id === 'study-board'
            ? [
                card('To study\nAdd topics…', 'blue'),
                card('Studying\nWork in progress…', 'yellow'),
                card('Mastered\nWhat you know…', 'mint'),
              ]
            : [
                card('Main topic', 'yellow', 'ellipse'),
                card('Idea 1', 'blue'),
                card('Idea 2', 'mint'),
                card('Idea 3', 'peach'),
                card('Idea 4', 'blue'),
              ];
  return { type: 'noteLayout', attrs: { layout: id }, content };
}

/** Insert after the current top-level block; never overwrite selected note text. */
export function insertNoteVisual(editor: Editor, id: DrawingPresetId) {
  if (!editor.isEditable) return false;
  const { $from, to } = editor.state.selection;
  const empty =
    $from.depth === 1 && $from.parent.type.name === 'paragraph' && !$from.parent.content.size;
  const end = $from.depth ? $from.after(1) : to;
  const from = empty ? $from.before(1) : end;
  const visual = createNoteVisual(id);
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to: end }, [visual, { type: 'paragraph' }])
    .setTextSelection(from + (visual.type === 'noteLayout' ? 3 : 2))
    .run();
}
