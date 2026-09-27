import { useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import {
  Code2,
  Heading2,
  Image,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Network,
  PenLine,
  Quote,
  Search,
  Sigma,
  Radical,
  ListCollapse,
  Superscript,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingPresetId } from '@/features/documents/lib/drawingPresets';
import { insertNoteVisual } from '@/features/documents/lib/noteVisuals';
import { createMermaidBlock } from '@/features/documents/lib/mermaid';
import { insertFormula } from '@/features/documents/lib/noteMath';
import { createToggle } from '@/features/documents/lib/noteDetails';
import { insertFootnote } from '@/features/documents/lib/noteFootnotes';
import { DrawingPresetPreview } from './DrawingPresetPreview';

type BlockChoice = { label: string; description: string; Icon: LucideIcon; node: JSONContent };
const BLOCKS: BlockChoice[] = [
  { label: 'Text', description: 'Start a new paragraph', Icon: Type, node: { type: 'paragraph' } },
  {
    label: 'Heading',
    description: 'Give your notes structure',
    Icon: Heading2,
    node: { type: 'heading', attrs: { level: 2 } },
  },
  {
    label: 'Checklist',
    description: 'Keep track of what’s next',
    Icon: ListChecks,
    node: {
      type: 'taskList',
      content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }],
    },
  },
  {
    label: 'Bulleted list',
    description: 'Collect the key points',
    Icon: List,
    node: { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  },
  {
    label: 'Numbered list',
    description: 'Break it down into steps',
    Icon: ListOrdered,
    node: {
      type: 'orderedList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
    },
  },
  {
    label: 'Quote',
    description: 'Make a passage stand out',
    Icon: Quote,
    node: { type: 'blockquote', content: [{ type: 'paragraph' }] },
  },
  {
    label: 'Code block',
    description: 'A space for your snippets',
    Icon: Code2,
    node: { type: 'codeBlock' },
  },
  {
    label: 'Formula',
    description: 'Typeset maths with LaTeX',
    Icon: Sigma,
    node: { type: 'blockMath', attrs: { latex: '' } },
  },
  {
    label: 'Toggle',
    description: 'Hide an answer until you check',
    Icon: ListCollapse,
    node: createToggle(),
  },
  {
    label: 'Mermaid diagram',
    description: 'Write or paste code to draw a diagram',
    Icon: Network,
    node: createMermaidBlock(),
  },
];
const TEMPLATES: { id: DrawingPresetId; label: string; description: string }[] = [
  { id: 'study-card', label: 'Study card', description: 'Question & answer' },
  { id: 'cornell', label: 'Cornell notes', description: 'Cues, notes & summary' },
  { id: 'compare', label: 'Compare', description: 'Two ideas, side by side' },
  { id: 'flow', label: 'Flow', description: 'Connect the steps' },
  { id: 'study-board', label: 'Study board', description: 'Track your learning' },
  { id: 'mind-map', label: 'Mind map', description: 'Explore an idea' },
];
const SHAPES: { id: DrawingPresetId; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'arrow', label: 'Arrow' },
];

/** Inserts at a block boundary, preserving the text selected before opening the panel. */
function insertNoteBlock(editor: Editor, node: JSONContent) {
  if (!editor.isEditable) return false;
  const { $from } = editor.state.selection;
  const empty =
    $from.depth === 1 && $from.parent.type.name === 'paragraph' && !$from.parent.content.size;
  const end = $from.depth ? $from.after(1) : editor.state.doc.content.size;
  const from = empty ? $from.before(1) : end;
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to: end }, [node, { type: 'paragraph' }])
    .command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
      return true;
    })
    .run();
}

export function NoteInsertPanel({
  editor,
  disabled,
  onImage,
  onCanvas,
  onClose,
}: {
  editor: Editor;
  disabled: boolean;
  onImage: () => void;
  onCanvas: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const editable = editor.isEditable && !disabled;
  const blocks = BLOCKS.filter((item) => matches(`${item.label} ${item.description}`));
  const templates = TEMPLATES.filter((item) => matches(`${item.label} ${item.description}`));
  const shapes = SHAPES.filter((item) => matches(item.label));
  function insert(node: JSONContent) {
    if (insertNoteBlock(editor, node)) onClose();
  }
  function visual(id: DrawingPresetId) {
    if (insertNoteVisual(editor, id)) onClose();
  }
  const table: JSONContent = {
    type: 'table',
    content: Array.from({ length: 3 }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: 3 }, () => ({
        type: row === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph' }],
      })),
    })),
  };
  const extras = [
    { label: 'Image', description: 'Add a photo or screenshot', Icon: Image, action: onImage },
    {
      label: 'Table',
      description: 'Organise rows & columns',
      Icon: Table2,
      action: () => insert(table),
    },
    {
      label: 'Divider',
      description: 'A quiet break between ideas',
      Icon: Minus,
      action: () => insert({ type: 'horizontalRule' }),
    },
    {
      label: 'Inline formula',
      description: 'Maths inside the line',
      Icon: Radical,
      action: () => insertFormula(editor, false),
    },
    {
      label: 'Footnote',
      description: 'A source or remark at the end',
      Icon: Superscript,
      action: () => insertFootnote(editor),
    },
  ].filter((item) => matches(`${item.label} ${item.description}`));
  const showStickies = matches('sticky notes yellow peach mint blue card');
  return (
    <div className="note-insert-panel">
      <label className="note-insert-search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          aria-label="Search blocks"
          placeholder="Find a block…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!query && <kbd>/</kbd>}
      </label>
      {blocks.length + extras.length > 0 && (
        <section>
          <span className="note-panel-label">Essentials</span>
          <div className="note-insert-list">
            {blocks.map(({ label, description, Icon, node }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                disabled={!editable}
                onClick={() => insert(node)}
              >
                <span className="note-insert-icon">
                  <Icon size={17} aria-hidden />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
            {extras.map(({ label, description, Icon, action }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                disabled={!editable}
                onClick={() => {
                  action();
                  onClose();
                }}
              >
                <span className="note-insert-icon">
                  <Icon size={17} aria-hidden />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {showStickies && (
        <section>
          <span className="note-panel-label">Sticky notes</span>
          <div className="note-insert-stickies">
            {(['yellow', 'peach', 'mint', 'blue'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                aria-label={`${tone.charAt(0).toUpperCase()}${tone.slice(1)} sticky note`}
                className={`is-${tone}`}
                disabled={!editable}
                onClick={() => visual(`sticky-${tone}`)}
              >
                <span aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {templates.length > 0 && (
        <section>
          <span className="note-panel-label">Study layouts</span>
          <div className="note-insert-templates">
            {templates.map(({ id, label, description }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                disabled={!editable}
                onClick={() => visual(id)}
              >
                <DrawingPresetPreview id={id} target="note" />
                <strong>{label}</strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {shapes.length > 0 && (
        <section>
          <span className="note-panel-label">Shapes</span>
          <div className="note-insert-shapes">
            {shapes.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                title={label}
                disabled={!editable}
                onClick={() => visual(id)}
              >
                <DrawingPresetPreview id={id} target="note" />
              </button>
            ))}
          </div>
        </section>
      )}
      {!blocks.length && !extras.length && !templates.length && !shapes.length && !showStickies && (
        <p className="note-panel-note">No blocks found. Try “table” or “study”.</p>
      )}
      <button
        type="button"
        className="note-insert-canvas"
        aria-label="Open visual canvas"
        onClick={() => {
          onClose();
          onCanvas();
        }}
      >
        <PenLine size={17} aria-hidden />
        <span>
          <strong>Open visual canvas</strong>
          <small>Room to sketch and connect ideas</small>
        </span>
      </button>
    </div>
  );
}
