import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { attachmentName, isPdfFile } from './attachments';
import { MAX_UPLOAD_BYTES, uploadDocument } from './files';

type Notice = { tone: 'error' | 'info'; text: string };

/** Tracks the insertion selection while a native picker or upload is pending. */
export function attachmentTarget(editor: Editor, position?: number) {
  let bookmark = (
    position === undefined
      ? editor.state.selection
      : TextSelection.near(editor.state.doc.resolve(position))
  ).getBookmark();
  const map = ({ transaction }: { transaction: Transaction }) => {
    bookmark = bookmark.map(transaction.mapping);
  };
  editor.on('transaction', map);
  return {
    selection: () => bookmark.resolve(editor.state.doc),
    dispose: () => editor.off('transaction', map),
  };
}

export async function insertAttachments(
  editor: Editor,
  files: File[],
  notePath: string,
  report: (notice: Notice) => void,
  target = attachmentTarget(editor),
) {
  try {
    for (const file of files) {
      if (editor.isDestroyed || !editor.isEditable) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        report({ tone: 'error', text: `“${file.name}” is larger than 25 MB and was not added.` });
        continue;
      }
      try {
        const { src } = await uploadDocument<{ src: string }>(
          { kind: 'attachment', note: notePath, name: attachmentName(file) },
          new Uint8Array(await file.arrayBuffer()),
        );
        if (editor.isDestroyed || !editor.isEditable) return;
        const pdf = isPdfFile(file);
        const node = editor.state.schema.nodes[pdf ? 'notePdf' : 'image']?.create(
          pdf
            ? { src, name: file.name, size: file.size, view: 'embed' }
            : { src, alt: file.name.replace(/\.[^.]+$/, '') },
        );
        if (!node) continue;
        const transaction = editor.state.tr
          .setSelection(target.selection())
          .replaceSelectionWith(node);
        // At the document end ProseMirror can select the newly inserted atom.
        // Keep a text cursor after it so the next upload cannot replace it.
        if (transaction.selection instanceof NodeSelection) {
          const after = transaction.selection.to;
          transaction.insert(after, editor.state.schema.nodes.paragraph!.create());
          transaction.setSelection(TextSelection.near(transaction.doc.resolve(after + 1)));
        }
        editor.view.dispatch(transaction.scrollIntoView());
        target.dispose();
        target = attachmentTarget(editor);
      } catch (cause) {
        report({ tone: 'error', text: `“${file.name}” could not be added. ${String(cause)}` });
      }
    }
  } finally {
    target.dispose();
  }
}
