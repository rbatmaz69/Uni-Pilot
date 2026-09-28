import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { findMatches, type TextRange } from '@/features/documents/lib/noteOutline';

export interface NoteSearchState {
  query: string;
  /** Index into `matches` of the match that is scrolled to. */
  current: number;
  matches: TextRange[];
  decorations: DecorationSet;
}

export const noteSearchKey = new PluginKey<NoteSearchState>('noteSearch');

function build(doc: ProseMirrorNode, query: string, current: number): NoteSearchState {
  const matches = findMatches(doc, query);
  const index = matches.length ? ((current % matches.length) + matches.length) % matches.length : 0;
  const decorations = DecorationSet.create(
    doc,
    matches.map((match, position) =>
      Decoration.inline(match.from, match.to, {
        class: position === index ? 'note-search-match is-current' : 'note-search-match',
      }),
    ),
  );
  return { query, current: index, matches, decorations };
}

/**
 * Highlights "Find in note" matches. Only decorations: the document and the
 * saved Markdown are never touched.
 */
export const NoteSearch = Extension.create({
  name: 'noteSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin<NoteSearchState>({
        key: noteSearchKey,
        state: {
          init: (_config, state) => build(state.doc, '', 0),
          apply(transaction, previous) {
            const meta = transaction.getMeta(noteSearchKey) as
              { query: string; current: number } | undefined;
            if (meta) return build(transaction.doc, meta.query, meta.current);
            // Typing keeps the same query, so its matches are found again.
            if (transaction.docChanged && previous.query)
              return build(transaction.doc, previous.query, previous.current);
            return previous;
          },
        },
        props: {
          decorations: (state) => noteSearchKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export function noteSearchState(state: EditorState): NoteSearchState | undefined {
  return noteSearchKey.getState(state);
}

export function setNoteSearch(view: EditorView, query: string, current = 0) {
  view.dispatch(
    view.state.tr.setMeta(noteSearchKey, { query, current }).setMeta('addToHistory', false),
  );
}
