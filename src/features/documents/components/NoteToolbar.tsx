import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  ListPlus,
  Redo2,
  Shapes,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import {
  activeBlockType,
  BLOCK_TYPES,
  openBlockMenu,
  turnInto,
} from '@/features/documents/lib/blockTypes';
import { cn } from '@/lib/utils';
import { insertNoteVisual } from '@/features/documents/lib/noteVisuals';
import { DrawingInsertPalette } from './DrawingInsertPalette';

type MarkName = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'code';

const MARKS: {
  name: MarkName;
  label: string;
  Icon: LucideIcon;
  toggle: (editor: Editor) => void;
}[] = [
  {
    name: 'bold',
    label: 'Bold',
    Icon: Bold,
    toggle: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    label: 'Italic',
    Icon: Italic,
    toggle: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: 'underline',
    label: 'Underline',
    Icon: Underline,
    toggle: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    name: 'strike',
    label: 'Strikethrough',
    Icon: Strikethrough,
    toggle: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    name: 'highlight',
    label: 'Highlight',
    Icon: Highlighter,
    toggle: (editor) => editor.chain().focus().toggleHighlight().run(),
  },
  {
    name: 'code',
    label: 'Inline code',
    Icon: Code,
    toggle: (editor) => editor.chain().focus().toggleCode().run(),
  },
];

function ToolButton({
  label,
  Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn('note-toolbar-button', active && 'is-active')}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

/** Always-visible controls for the same Markdown-safe schema used by the slash and selection menus. */
export function NoteToolbar({
  editor,
  disabled = false,
  onOpenCanvas,
  presentation = 'toolbar',
}: {
  editor: Editor;
  disabled?: boolean;
  onOpenCanvas?: () => void;
  presentation?: 'toolbar' | 'panel';
}) {
  const [showComponents, setShowComponents] = useState(true);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: activeBlockType(current).id,
      singleBlock:
        !(current.state.selection instanceof NodeSelection) &&
        current.state.selection.$from.sameParent(current.state.selection.$to),
      marks: Object.fromEntries(MARKS.map(({ name }) => [name, current.isActive(name)])) as Record<
        MarkName,
        boolean
      >,
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });
  const editable = editor.isEditable && !disabled;

  if (presentation === 'panel') {
    return (
      <div className="note-format-panel" aria-label="Note formatting">
        <section>
          <span className="note-panel-label">Text style</span>
          <div className="note-format-styles">
            {BLOCK_TYPES.slice(0, 4).map((block, index) => (
              <button
                key={block.id}
                type="button"
                className={cn('note-format-style', state.block === block.id && 'is-active')}
                aria-pressed={state.block === block.id}
                disabled={!editable || !state.singleBlock}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => turnInto(editor, block)}
              >
                <span aria-hidden>{index === 0 ? 'Aa' : `H${index}`}</span>
                {index === 0
                  ? 'Body'
                  : index === 1
                    ? 'Title'
                    : index === 2
                      ? 'Heading'
                      : 'Subheading'}
              </button>
            ))}
          </div>
        </section>
        <section>
          <span className="note-panel-label">Emphasis</span>
          <div className="note-format-marks" role="group" aria-label="Text formatting">
            {MARKS.map(({ name, label, Icon, toggle }) => (
              <ToolButton
                key={name}
                label={label}
                Icon={Icon}
                active={state.marks[name]}
                disabled={!editable}
                onClick={() => toggle(editor)}
              />
            ))}
          </div>
        </section>
        <section>
          <span className="note-panel-label">Lists & blocks</span>
          <div className="note-format-blocks">
            {(
              [
                ['bulletList', List],
                ['orderedList', ListOrdered],
                ['taskList', ListChecks],
                ['blockquote', Quote],
                ['codeBlock', Code],
              ] as const
            ).map(([name, Icon]) => {
              const block = BLOCK_TYPES.find((item) => item.id === name)!;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={state.block === name}
                  className={cn('note-format-block', state.block === name && 'is-active')}
                  disabled={!editable || !state.singleBlock}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => turnInto(editor, block)}
                >
                  <Icon size={16} aria-hidden />
                  {block.label}
                </button>
              );
            })}
          </div>
        </section>
        <div className="note-format-history">
          <span>History</span>
          <ToolButton
            label="Undo"
            Icon={Undo2}
            disabled={!editable || !state.undo}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolButton
            label="Redo"
            Icon={Redo2}
            disabled={!editable || !state.redo}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="note-toolbar" role="toolbar" aria-label="Note formatting">
        <label className="note-toolbar-block">
          <span className="sr-only">Block style</span>
          <select
            aria-label="Block style"
            value={state.block}
            disabled={!editable || !state.singleBlock}
            onChange={(event) => {
              const block = BLOCK_TYPES.find((type) => type.id === event.target.value);
              if (block) turnInto(editor, block);
            }}
          >
            {BLOCK_TYPES.map((block) => (
              <option key={block.id} value={block.id}>
                {block.label}
              </option>
            ))}
          </select>
        </label>
        <span className="note-toolbar-divider" aria-hidden />
        <div className="note-toolbar-group" aria-label="Text formatting">
          {MARKS.map(({ name, label, Icon, toggle }) => (
            <ToolButton
              key={name}
              label={label}
              Icon={Icon}
              active={state.marks[name]}
              disabled={!editable}
              onClick={() => toggle(editor)}
            />
          ))}
        </div>
        <span className="note-toolbar-divider" aria-hidden />
        <ToolButton
          label="Insert block"
          Icon={ListPlus}
          disabled={!editable}
          onClick={() => openBlockMenu(editor)}
        />
        <span className="note-toolbar-spacer" />
        <button
          type="button"
          className="note-toolbar-canvas"
          aria-expanded={showComponents}
          onClick={() => setShowComponents(!showComponents)}
        >
          <Shapes size={16} aria-hidden />
          Components
        </button>
        {onOpenCanvas ? (
          <button type="button" className="note-toolbar-canvas" onClick={onOpenCanvas}>
            <Shapes size={16} aria-hidden />
            Visual canvas
          </button>
        ) : null}
        <div className="note-toolbar-group" aria-label="History">
          <ToolButton
            label="Undo"
            Icon={Undo2}
            disabled={!editable || !state.undo}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolButton
            label="Redo"
            Icon={Redo2}
            disabled={!editable || !state.redo}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
      </div>
      {showComponents && (
        <DrawingInsertPalette
          target="note"
          disabled={!editable}
          onInsert={(id) => insertNoteVisual(editor, id)}
        />
      )}
    </>
  );
}
