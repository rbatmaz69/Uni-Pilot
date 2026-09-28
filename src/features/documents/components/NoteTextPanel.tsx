import { useId } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { Code2, List, ListChecks, ListOrdered, Quote, type LucideIcon } from 'lucide-react';
import {
  activeBlockType,
  BLOCK_TYPES,
  turnInto,
  type BlockTypeId,
} from '@/features/documents/lib/blockTypes';
import { cn } from '@/lib/utils';
import { MARKS, type MarkName } from '@/features/documents/lib/textMarks';
import { ToolButton } from './NoteToolbar';

/** Paragraph styles, drawn as they will look. Names match "Turn into" and the `/` menu. */
const STYLES: { id: BlockTypeId; glyph: string }[] = [
  { id: 'paragraph', glyph: 'Aa' },
  { id: 'heading1', glyph: 'H1' },
  { id: 'heading2', glyph: 'H2' },
  { id: 'heading3', glyph: 'H3' },
];
const BLOCKS: { id: BlockTypeId; Icon: LucideIcon }[] = [
  { id: 'bulletList', Icon: List },
  { id: 'orderedList', Icon: ListOrdered },
  { id: 'taskList', Icon: ListChecks },
  { id: 'blockquote', Icon: Quote },
  { id: 'codeBlock', Icon: Code2 },
];
const blockType = (id: BlockTypeId) => BLOCK_TYPES.find((type) => type.id === id)!;

/**
 * Changes the text you are on: the paragraph style, emphasis, and whether it
 * is a list, quote or code. Everything here is plain Markdown, the same set
 * the selection menu and the `/` menu offer.
 */
export function NoteTextPanel({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const id = useId();
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
    }),
  });
  const editable = editor.isEditable && !disabled;
  const turnable = editable && state.singleBlock;

  return (
    <div className="note-text-panel">
      <div className="note-text-row">
        <span className="note-panel-label" id={`${id}-style`}>
          Style
        </span>
        <div className="note-text-styles" role="group" aria-labelledby={`${id}-style`}>
          {STYLES.map(({ id: style, glyph }) => (
            <button
              key={style}
              type="button"
              className={cn('note-text-style', `is-${style}`, state.block === style && 'is-active')}
              aria-label={blockType(style).label}
              aria-pressed={state.block === style}
              title={`${blockType(style).label} (${blockType(style).hint.trim() || 'plain text'})`}
              disabled={!turnable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => turnInto(editor, blockType(style))}
            >
              <span aria-hidden>{glyph}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="note-text-row">
        <span className="note-panel-label" id={`${id}-marks`}>
          Emphasis
        </span>
        <div className="note-text-marks" role="group" aria-labelledby={`${id}-marks`}>
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
      </div>
      <div className="note-text-row">
        <span className="note-panel-label" id={`${id}-blocks`}>
          Turn into
        </span>
        <div className="note-text-blocks" role="group" aria-labelledby={`${id}-blocks`}>
          {BLOCKS.map(({ id: block, Icon }) => (
            <button
              key={block}
              type="button"
              className={cn('note-text-block', state.block === block && 'is-active')}
              aria-pressed={state.block === block}
              disabled={!turnable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => turnInto(editor, blockType(block))}
            >
              <Icon size={17} aria-hidden />
              <span>{blockType(block).label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
