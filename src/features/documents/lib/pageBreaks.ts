import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** How many page boundaries the text crosses: one fewer than its sheets. */
export const notePageBreaksKey = new PluginKey<number>('notePageBreaks');

function breaksWidget(breaks: number) {
  const holder = document.createElement('div');
  holder.className = 'note-sheet-breaks';
  holder.setAttribute('aria-hidden', 'true');
  holder.contentEditable = 'false';
  for (let index = 0; index < breaks; index += 1) {
    // Lines avoid a float's whole margin box, so the writable height above a
    // boundary is held by a float of no width that no line has to avoid.
    const space = document.createElement('span');
    space.className = 'note-sheet-space';
    const boundary = document.createElement('span');
    boundary.className = 'note-sheet-break';
    holder.append(space, boundary);
  }
  return holder;
}

/**
 * The page boundaries of the paged layout: full-width floats stacked at the
 * start of the text. They have to live inside the editor, because the
 * editable root keeps floats outside it from reaching its lines. Only a
 * decoration: the document and the saved Markdown are never touched.
 */
export const NotePageBreaks = Extension.create({
  name: 'notePageBreaks',
  addProseMirrorPlugins() {
    return [
      new Plugin<number>({
        key: notePageBreaksKey,
        state: {
          init: () => 0,
          apply: (transaction, previous) =>
            (transaction.getMeta(notePageBreaksKey) as number | undefined) ?? previous,
        },
        props: {
          decorations(state) {
            const breaks = notePageBreaksKey.getState(state) ?? 0;
            if (!breaks) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(0, () => breaksWidget(breaks), {
                side: -1,
                key: `note-page-breaks-${breaks}`,
                ignoreSelection: true,
              }),
            ]);
          },
        },
      }),
    ];
  },
});

export function pageBreaks(state: EditorState): number {
  return notePageBreaksKey.getState(state) ?? 0;
}

export function setPageBreaks(view: EditorView, breaks: number) {
  if (view.isDestroyed || pageBreaks(view.state) === breaks) return;
  view.dispatch(view.state.tr.setMeta(notePageBreaksKey, breaks).setMeta('addToHistory', false));
}
