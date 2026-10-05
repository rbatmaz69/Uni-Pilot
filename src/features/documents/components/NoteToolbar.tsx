import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { ListPlus, Redo2, Shapes, Undo2, type LucideIcon } from 'lucide-react';
import {
  activeBlockType,
  BLOCK_TYPES,
  openBlockMenu,
  turnInto,
} from '@/features/documents/lib/blockTypes';
import { cn } from '@/lib/utils';
import { insertNoteVisual } from '@/features/documents/lib/noteVisuals';
import { MARKS, type MarkName } from '@/features/documents/lib/textMarks';
import { DrawingInsertPalette } from './DrawingInsertPalette';

export function ToolButton({
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
}: {
  editor: Editor;
  disabled?: boolean;
  onOpenCanvas?: () => void;
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
