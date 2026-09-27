import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

export function editNoteObject(editor: Editor, position: number) {
  if (!editor.isEditable) return false;
  const node = editor.state.doc.nodeAt(position);
  if (!node) return false;
  const selection = TextSelection.near(editor.state.doc.resolve(position + 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.focus();
  return true;
}

export function canMoveNoteObject(editor: Editor, position: number, direction: -1 | 1) {
  if (!editor.isEditable) return false;
  const resolved = editor.state.doc.resolve(position);
  const index = resolved.index();
  return direction === -1 ? index > 0 : index + 1 < resolved.parent.childCount;
}

/** Reorder siblings in one undoable transaction, including cards within a layout. */
export function moveNoteObject(editor: Editor, position: number, direction: -1 | 1) {
  if (!canMoveNoteObject(editor, position, direction)) return false;
  const resolved = editor.state.doc.resolve(position);
  const index = resolved.index();
  const children = Array.from({ length: resolved.parent.childCount }, (_, i) =>
    resolved.parent.child(i),
  );
  const moving = children[index]!;
  const adjacent = children[index + direction]!;
  children[index] = adjacent;
  children[index + direction] = moving;
  const start = resolved.start();
  const transaction = closeHistory(editor.state.tr).replaceWith(
    start,
    resolved.end(),
    Fragment.fromArray(children),
  );
  const nextPosition = position + (direction === -1 ? -adjacent.nodeSize : adjacent.nodeSize);
  transaction.setSelection(NodeSelection.create(transaction.doc, nextPosition)).scrollIntoView();
  editor.view.dispatch(transaction);
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.view.focus();
  return true;
}
