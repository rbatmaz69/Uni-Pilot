import { Extension, type Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** A block the handle beside the text moves: a top-level block or a list item. */
export interface BlockTarget {
  pos: number;
  node: ProseMirrorNode;
}

const ITEMS = new Set(['listItem', 'taskItem']);
// Cards and layouts bring their own grip and options.
const OWN_HANDLE = new Set(['noteCard', 'noteLayout']);
// Blocks whose text can be turned into another kind of block.
const TEXT_BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  ...ITEMS,
]);

function target(pos: number, node: ProseMirrorNode | null | undefined): BlockTarget | null {
  return node && !OWN_HANDLE.has(node.type.name) ? { pos, node } : null;
}

/** The block at a document position: the innermost list item, else the top-level block. */
export function blockAt(doc: ProseMirrorNode, pos: number): BlockTarget | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (ITEMS.has(node.type.name)) return target($pos.before(depth), node);
  }
  if ($pos.depth === 0) return target($pos.pos, $pos.nodeAfter);
  return target($pos.before(1), $pos.node(1));
}

/** The block beside a point on screen; the point may lie left of the text, where the handle is. */
export function blockAtPoint(view: EditorView, x: number, y: number): BlockTarget | null {
  const bounds = view.dom.getBoundingClientRect();
  if (y < bounds.top || y > bounds.bottom) return null;
  const left = Math.min(Math.max(x, bounds.left + 1), bounds.right - 1);
  const found = view.posAtCoords({ left, top: y });
  if (!found) return null;
  // Over a formula or an image, `pos` is beside it; `inside` is the node itself.
  const atom = found.inside >= 0 && view.state.doc.nodeAt(found.inside)?.isAtom;
  return blockAt(view.state.doc, atom ? found.inside : found.pos);
}

export function canTurnInto(block: BlockTarget) {
  return TEXT_BLOCKS.has(block.node.type.name);
}

export function canMoveBlock(editor: Editor, pos: number, direction: -1 | 1) {
  if (!editor.isEditable) return false;
  const $pos = editor.state.doc.resolve(pos);
  const index = $pos.index();
  return direction === -1 ? index > 0 : index + 1 < $pos.parent.childCount;
}

/**
 * Swaps the block with its neighbour in one undoable step. A cursor inside it
 * moves along; otherwise the moved block ends up selected.
 */
export function moveBlock(editor: Editor, pos: number, direction: -1 | 1) {
  if (!canMoveBlock(editor, pos, direction)) return false;
  const { state } = editor;
  const $pos = state.doc.resolve(pos);
  const index = $pos.index();
  const moving = $pos.parent.child(index);
  const neighbour = $pos.parent.child(index + direction);
  const [first, second] = direction === -1 ? [moving, neighbour] : [neighbour, moving];
  const from = direction === -1 ? pos - neighbour.nodeSize : pos;
  const to = from + moving.nodeSize + neighbour.nodeSize;
  const shift = direction === -1 ? -neighbour.nodeSize : neighbour.nodeSize;
  const transaction = closeHistory(state.tr).replaceWith(from, to, Fragment.from([first, second]));
  const { anchor, head } = state.selection;
  const inside = (position: number) => position > pos && position < pos + moving.nodeSize;
  transaction.setSelection(
    state.selection instanceof TextSelection && inside(anchor) && inside(head)
      ? TextSelection.create(transaction.doc, anchor + shift, head + shift)
      : NodeSelection.create(transaction.doc, pos + shift),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

export function duplicateBlock(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!editor.isEditable || !node) return false;
  const after = pos + node.nodeSize;
  const transaction = editor.state.tr.insert(after, node.copy(node.content));
  transaction.setSelection(NodeSelection.create(transaction.doc, after)).scrollIntoView();
  editor.view.dispatch(transaction);
  return true;
}

export function deleteBlock(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!editor.isEditable || !node) return false;
  editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  return true;
}

/** Puts the cursor at the end of the block's text, e.g. to turn it into another block. */
export function placeCursorIn(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  const selection = TextSelection.near(editor.state.doc.resolve(pos + node.nodeSize - 1), -1);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

/**
 * Starts dragging the block from the handle beside it. ProseMirror then moves
 * it on drop, exactly as when dragging a selection, with its drop cursor.
 */
export function startBlockDrag(view: EditorView, pos: number, transfer: DataTransfer) {
  if (!view.editable || !view.state.doc.nodeAt(pos)) return false;
  const selection = NodeSelection.create(view.state.doc, pos);
  view.dispatch(view.state.tr.setSelection(selection));
  const { dom, text, slice } = view.serializeForClipboard(selection.content());
  transfer.clearData();
  transfer.setData('text/html', dom.innerHTML);
  transfer.setData('text/plain', text);
  transfer.effectAllowed = 'copyMove';
  const block = view.nodeDOM(pos);
  if (block instanceof HTMLElement) transfer.setDragImage(block, 0, 0);
  // `node` makes the drop remove exactly this block, wherever the selection went.
  view.dragging = { slice, move: true, node: selection } as EditorView['dragging'];
  return true;
}

/** Ends a drag from the handle; the grip, not the editor, receives its `dragend`. */
export function endBlockDrag(view: EditorView) {
  view.dragging = null;
}

/**
 * ⌘/Ctrl + Shift + ↑ / ↓ moves the block the cursor is in, as in Notion. The
 * handle beside the text does the same with the mouse.
 */
export const NoteBlockKeys = Extension.create({
  name: 'noteBlockKeys',
  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const block = blockAt(this.editor.state.doc, this.editor.state.selection.from);
      return block ? moveBlock(this.editor, block.pos, direction) : false;
    };
    return { 'Mod-Shift-ArrowUp': move(-1), 'Mod-Shift-ArrowDown': move(1) };
  },
});
