import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  blockAtPoint,
  canMoveBlock,
  canTurnInto,
  deleteBlock,
  duplicateBlock,
  endBlockDrag,
  moveBlock,
  placeCursorIn,
  startBlockDrag,
  type BlockTarget,
} from '@/features/documents/lib/blockActions';
import {
  BLOCK_TYPES,
  openBlockMenu,
  turnInto,
  type BlockTypeId,
} from '@/features/documents/lib/blockTypes';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { SLASH_ICONS } from './slashIcons';

type Placed = BlockTarget & { top: number; left: number };

// The handle's two buttons and the room between them and the text.
const HANDLE_WIDTH = 46;
const HANDLE_HEIGHT = 24;
const MENU_HEIGHT = 420;
const GAP = 6;

/** How much a zoomed page draws an element larger or smaller than its layout. */
function zoomOf(element: HTMLElement) {
  return element.offsetWidth > 0 ? element.getBoundingClientRect().width / element.offsetWidth : 1;
}

/** Where the handle for `block` goes, in the unzoomed pixels of `container`. */
function place(view: EditorView, block: BlockTarget, container: HTMLElement): Placed | null {
  const dom = view.nodeDOM(block.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const zoom = zoomOf(container);
  const box = container.getBoundingClientRect();
  const rect = dom.getBoundingClientRect();
  // List items line up with their bullets, left of the item's text.
  const item = block.node.type.name === 'listItem' || block.node.type.name === 'taskItem';
  const edge = (item ? (dom.parentElement ?? dom) : dom).getBoundingClientRect().left;
  const line = parseFloat(getComputedStyle(dom).lineHeight);
  return {
    ...block,
    top: (rect.top - box.top) / zoom + Math.max(0, ((line || HANDLE_HEIGHT) - HANDLE_HEIGHT) / 2),
    left: (edge - box.left) / zoom - HANDLE_WIDTH - GAP,
  };
}

/** The kind of block the target is now, to mark it in “Turn into”. */
function currentType(editor: Editor, block: BlockTarget): BlockTypeId | null {
  const { node } = block;
  const name = node.type.name;
  if (name === 'heading') return `heading${Number(node.attrs.level)}` as BlockTypeId;
  if (name === 'listItem' || name === 'taskItem')
    return editor.state.doc.resolve(block.pos).parent.type.name as BlockTypeId;
  return BLOCK_TYPES.some((type) => type.id === name) ? (name as BlockTypeId) : null;
}

interface BlockMenuProps {
  editor: Editor;
  block: BlockTarget;
  /** The handle's grip, which the menu opens under. */
  anchor: DOMRect | null;
  /** `refocus` returns the focus to the grip, e.g. after Escape. */
  onClose: (refocus: boolean) => void;
}

/** What can be done with one block: duplicate, move, delete or turn it into another kind. */
export function BlockMenu({ editor, block, anchor, onClose }: BlockMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const { isMac } = usePlatformModifier();
  const shortcut = (arrow: string) => (isMac ? `⌘⇧${arrow}` : `Ctrl+Shift+${arrow}`);
  const current = currentType(editor, block);

  const closeOutside = useEffectEvent((event: PointerEvent) => {
    if (!menu.current?.contains(event.target as Node)) onClose(false);
  });
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  function run(action: () => unknown) {
    onClose(false);
    action();
    editor.view.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(items.length - 1);
    else if (event.key === 'Escape') onClose(true);
    else if (event.key === 'Tab') onClose(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  }

  const position = anchor
    ? {
        top:
          window.innerHeight - anchor.bottom > MENU_HEIGHT + GAP
            ? anchor.bottom + GAP
            : Math.max(GAP, anchor.top - MENU_HEIGHT - GAP),
        left: Math.max(GAP, Math.min(anchor.left, window.innerWidth - 250)),
      }
    : undefined;

  const actions = [
    {
      label: 'Duplicate',
      icon: <Copy size={15} />,
      run: () => duplicateBlock(editor, block.pos),
    },
    {
      label: 'Move up',
      icon: <ArrowUp size={15} />,
      hint: shortcut('↑'),
      disabled: !canMoveBlock(editor, block.pos, -1),
      run: () => moveBlock(editor, block.pos, -1),
    },
    {
      label: 'Move down',
      icon: <ArrowDown size={15} />,
      hint: shortcut('↓'),
      disabled: !canMoveBlock(editor, block.pos, 1),
      run: () => moveBlock(editor, block.pos, 1),
    },
    {
      label: 'Delete',
      icon: <Trash2 size={15} />,
      danger: true,
      run: () => deleteBlock(editor, block.pos),
    },
  ];

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label="Block options"
      className="note-block-menu"
      style={position}
      onKeyDown={onKeyDown}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          className={cn('note-block-menu-item', action.danger && 'is-danger')}
          onClick={() => run(action.run)}
        >
          <span aria-hidden>{action.icon}</span>
          <span>{action.label}</span>
          {action.hint ? <kbd>{action.hint}</kbd> : null}
        </button>
      ))}
      {canTurnInto(block) ? (
        <div role="group" aria-labelledby="note-block-menu-turn">
          <div id="note-block-menu-turn" className="note-block-menu-label">
            Turn into
          </div>
          {BLOCK_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              role="menuitemradio"
              aria-checked={current === type.id}
              className="note-block-menu-item"
              onClick={() =>
                run(() => {
                  placeCursorIn(editor, block.pos);
                  turnInto(editor, type);
                })
              }
            >
              <span aria-hidden>{SLASH_ICONS[type.id]}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

interface BlockHandleProps {
  editor: Editor;
  /** The page the handle is drawn on, beside the block under the pointer. */
  container: HTMLElement | null;
}

/**
 * The handle beside the block under the pointer, as in Notion: “+” adds a
 * block below it, the grip drags it elsewhere or opens its options. It hides
 * while typing and never appears in a read-only note.
 */
export function BlockHandle({ editor, container }: BlockHandleProps) {
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable,
  });
  const [placed, setPlaced] = useState<Placed | null>(null);
  // The grip's place on screen while its menu is open.
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const handle = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const held = Boolean(menu) || dragging;

  useEffect(() => {
    if (!container || !editable || held) return;
    const view = editor.view;
    const follow = (event: MouseEvent) => {
      if (handle.current?.contains(event.target as Node)) return;
      const block = blockAtPoint(view, event.clientX, event.clientY);
      setPlaced(block ? place(view, block, container) : null);
    };
    const hide = () => setPlaced(null);
    container.addEventListener('mousemove', follow);
    container.addEventListener('mouseleave', hide);
    // Typing hides the handle until the pointer moves again.
    view.dom.addEventListener('keydown', hide);
    return () => {
      container.removeEventListener('mousemove', follow);
      container.removeEventListener('mouseleave', hide);
      view.dom.removeEventListener('keydown', hide);
    };
  }, [container, editable, editor, held]);

  // Any edit may move the block, even while its menu is open or it is being
  // dropped: a drop removes the grip before its `dragend` could arrive.
  useEffect(() => {
    const reset = () => {
      setPlaced(null);
      setMenu(null);
      setDragging(false);
    };
    editor.on('update', reset);
    return () => {
      editor.off('update', reset);
    };
  }, [editor]);

  if (!editable || !placed) return null;

  function add() {
    if (!placed) return;
    placeCursorIn(editor, placed.pos);
    openBlockMenu(editor);
    setPlaced(null);
  }

  function startDrag(event: DragEvent<HTMLButtonElement>) {
    if (placed && startBlockDrag(editor.view, placed.pos, event.dataTransfer)) setDragging(true);
  }

  function endDrag() {
    endBlockDrag(editor.view);
    setDragging(false);
    setPlaced(null);
  }

  return (
    <>
      <div
        ref={handle}
        className={cn('note-block-handle', held && 'is-held')}
        style={{ top: placed.top, left: placed.left }}
        // A click here is not a click on the empty page below the text.
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="note-block-handle-button"
          aria-label="Add a block below"
          title="Add a block below"
          onClick={add}
        >
          <Plus size={16} />
        </button>
        <button
          ref={grip}
          type="button"
          className="note-block-handle-button is-grip"
          aria-label="Block options"
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          title="Drag to move · click for options"
          draggable
          onDragStart={startDrag}
          onDragEnd={endDrag}
          onClick={(event) => setMenu(menu ? null : event.currentTarget.getBoundingClientRect())}
        >
          <GripVertical size={16} />
        </button>
      </div>
      {menu ? (
        <BlockMenu
          editor={editor}
          block={placed}
          anchor={menu}
          onClose={(refocus) => {
            setMenu(null);
            if (refocus) grip.current?.focus();
            else setPlaced(null);
          }}
        />
      ) : null}
    </>
  );
}
