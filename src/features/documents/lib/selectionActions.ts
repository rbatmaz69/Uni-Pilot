import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

/** A sheet, card or toggle body is its own editing surface, not the document root. */
export function blockInsertionRange(editor: Editor) {
  const { $to, empty: selectionEmpty } = editor.state.selection;
  let depth = 1;
  for (let d = 1; d < $to.depth; d += 1) {
    if (
      ['studyPage', 'noteCard', 'detailsContent', 'tableCell', 'tableHeader'].includes(
        $to.node(d).type.name,
      )
    )
      depth = d + 1;
  }
  const to = $to.depth ? $to.after(depth) : editor.state.doc.content.size;
  const empty =
    selectionEmpty &&
    $to.depth === depth &&
    $to.parent.type.name === 'paragraph' &&
    !$to.parent.content.size;
  return { from: empty ? $to.before(depth) : to, to };
}

/** Insert beside the selected block in the nearest valid container, including a PDF note sheet. */
export function insertAfterSelection(editor: Editor, content: JSONContent) {
  if (!editor.isEditable) return false;
  const node = editor.schema.nodeFromJSON(content);
  const { $to } = editor.state.selection;
  for (let depth = $to.depth; depth > 0; depth -= 1) {
    const pos = $to.after(depth);
    const $pos = editor.state.doc.resolve(pos);
    if (!$pos.parent.canReplaceWith($pos.index(), $pos.index(), node.type)) continue;
    const tr = closeHistory(editor.state.tr).insert(pos, node);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.view.focus();
    return true;
  }
  return false;
}

export function insertSelectionTable(editor: Editor, rows: number, cols: number) {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 1 ||
    cols < 1 ||
    rows > 8 ||
    cols > 8
  )
    return false;
  return insertAfterSelection(editor, {
    type: 'table',
    content: Array.from({ length: rows }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: cols }, () => ({
        type: row === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph' }],
      })),
    })),
  });
}

/** Turn complete selected blocks into a callout or toggle without losing their unselected text. */
export function wrapSelection(editor: Editor, kind: 'callout' | 'toggle') {
  if (!editor.isEditable) return false;
  const { $from, $to } = editor.state.selection;
  const range = $from.blockRange($to);
  if (!range) return false;
  const blocks = editor.state.doc.slice(range.start, range.end).content;
  const content = blocks.toJSON() as JSONContent[];
  const first = blocks.firstChild;
  const node =
    kind === 'callout'
      ? { type: 'noteCard', attrs: { tone: 'blue', shape: 'rectangle' }, content }
      : {
          type: 'details',
          content: [
            {
              type: 'detailsSummary',
              content: first?.isTextblock
                ? content[0]?.content
                : [{ type: 'text', text: 'Details' }],
            },
            {
              type: 'detailsContent',
              content: first?.isTextblock
                ? content.slice(1).length
                  ? content.slice(1)
                  : [{ type: 'paragraph' }]
                : content,
            },
          ],
        };
  const replacement = editor.schema.nodeFromJSON(node);
  try {
    replacement.check();
  } catch {
    return false;
  }
  if (!range.parent.canReplaceWith(range.startIndex, range.endIndex, replacement.type))
    return false;
  const tr = closeHistory(editor.state.tr).replaceWith(range.start, range.end, replacement);
  tr.setSelection(TextSelection.near(tr.doc.resolve(range.start + 1)));
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.view.focus();
  return true;
}
