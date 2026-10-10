import { useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import {
  FileText,
  Image,
  ListCollapse,
  Minus,
  Network,
  PenLine,
  Radical,
  Search,
  Sigma,
  Superscript,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import type { DrawingPresetId } from '@/features/documents/lib/drawingPresets';
import { insertNoteVisual } from '@/features/documents/lib/noteVisuals';
import { createMermaidBlock } from '@/features/documents/lib/mermaid';
import { insertFormula } from '@/features/documents/lib/noteMath';
import { createToggle } from '@/features/documents/lib/noteDetails';
import { insertFootnote } from '@/features/documents/lib/noteFootnotes';
import { DrawingPresetPreview } from './DrawingPresetPreview';

/**
 * What the Insert popover shows: blocks that hold content of their own, or the
 * visual study objects. Headings, lists, quotes and code change the text you
 * are on, so they live in the Text popover and the selection menu instead.
 */
export type InsertTab = 'blocks' | 'visuals';

type Insertable = {
  label: string;
  detail: string;
  Icon: LucideIcon;
  /** Extra words the search should find it by. */
  keywords: string;
  run: () => void;
};

const TABLE: JSONContent = {
  type: 'table',
  content: Array.from({ length: 3 }, (_, row) => ({
    type: 'tableRow',
    content: Array.from({ length: 3 }, () => ({
      type: row === 0 ? 'tableHeader' : 'tableCell',
      content: [{ type: 'paragraph' }],
    })),
  })),
};
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
const STICKIES = ['yellow', 'peach', 'mint', 'blue'] as const;

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
  tab,
  onImage,
  onPdf,
  onCanvas,
  onClose,
}: {
  editor: Editor;
  disabled: boolean;
  tab: InsertTab;
  onImage: () => void;
  onPdf?: (() => void) | undefined;
  onCanvas: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(needle);
  // A search looks through both tabs, so nothing hides behind the other one.
  const showBlocks = Boolean(needle) || tab === 'blocks';
  const showVisuals = Boolean(needle) || tab === 'visuals';
  const editable = editor.isEditable && !disabled;
  const block = (node: JSONContent) => () => void insertNoteBlock(editor, node);

  const blocks = (
    [
      {
        label: 'Table',
        detail: 'Rows & columns',
        Icon: Table2,
        keywords: 'grid',
        run: block(TABLE),
      },
      {
        label: 'Image',
        detail: 'Photo, screenshot',
        Icon: Image,
        keywords: 'picture',
        run: onImage,
      },
      {
        label: 'PDF',
        detail: 'Embed or file card',
        Icon: FileText,
        keywords: 'document attachment file upload',
        run: onPdf ?? (() => undefined),
      },
      {
        label: 'Formula',
        detail: 'Maths block',
        Icon: Sigma,
        keywords: 'latex math equation block',
        run: block({ type: 'blockMath', attrs: { latex: '' } }),
      },
      {
        label: 'Inline formula',
        detail: 'Maths in a line',
        Icon: Radical,
        keywords: 'latex math equation',
        run: () => insertFormula(editor, false),
      },
      {
        label: 'Toggle',
        detail: 'Hide an answer',
        Icon: ListCollapse,
        keywords: 'details collapse',
        run: block(createToggle()),
      },
      {
        label: 'Footnote',
        detail: 'Source or remark',
        Icon: Superscript,
        keywords: 'citation reference',
        run: () => insertFootnote(editor),
      },
      {
        label: 'Diagram',
        detail: 'From Mermaid code',
        Icon: Network,
        keywords: 'mermaid chart flowchart',
        run: block(createMermaidBlock()),
      },
      {
        label: 'Divider',
        detail: 'A quiet break',
        Icon: Minus,
        keywords: 'line rule separator',
        run: block({ type: 'horizontalRule' }),
      },
    ] satisfies Insertable[]
  ).filter((item) => matches(`${item.label} ${item.detail} ${item.keywords}`));
  const templates = TEMPLATES.filter((item) => matches(`${item.label} ${item.description}`));
  const shapes = SHAPES.filter((item) => matches(`${item.label} shape`));
  const stickies = matches('sticky notes yellow peach mint blue card') ? STICKIES : [];
  const canvas = matches('visual canvas sketch draw');
  const visual = (id: DrawingPresetId) => {
    if (insertNoteVisual(editor, id)) onClose();
  };
  const nothing =
    !blocks.length && !templates.length && !shapes.length && !stickies.length && !canvas;

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
        {!query && <kbd title="Type / on an empty line for the same choices in the text">/</kbd>}
      </label>
      {showBlocks && blocks.length > 0 && (
        <div className="note-insert-grid" role="group" aria-label="Blocks">
          {blocks.map(({ label, detail, Icon, run }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={`${label} — ${detail}`}
              disabled={!editable}
              onClick={() => {
                run();
                onClose();
              }}
            >
              <Icon size={19} aria-hidden />
              <strong>{label}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
      )}
      {showVisuals && stickies.length > 0 && (
        <section>
          <span className="note-panel-label">Sticky notes</span>
          <div className="note-insert-stickies">
            {stickies.map((tone) => (
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
      {showVisuals && templates.length > 0 && (
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
      {showVisuals && shapes.length > 0 && (
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
      {showVisuals && canvas && (
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
      )}
      {nothing && <p className="note-panel-note">No blocks found. Try “table” or “study”.</p>}
    </div>
  );
}
