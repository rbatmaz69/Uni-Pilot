import type { Editor } from '@tiptap/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { InkColor, Tool } from '@/features/documents/lib/pdfInkTypes';

export type PagePosition = () => number | undefined;
interface StudyToolsState {
  tool: Tool;
  color: InkColor;
  active: PagePosition | null;
  selected: { page: PagePosition; id: string } | null;
}

// Each open editor owns its tools. They are never written into the Markdown file.
const stores = new WeakMap<Editor, StoreApi<StudyToolsState>>();
export function studyToolsStore(editor: Editor) {
  let store = stores.get(editor);
  if (!store) {
    store = createStore<StudyToolsState>(() => ({
      tool: 'select',
      color: 'ink',
      active: null,
      selected: null,
    }));
    stores.set(editor, store);
  }
  return store;
}

export function useStudyTools(editor: Editor) {
  return useStore(studyToolsStore(editor));
}

export function activeStudyPage(
  editor: Editor,
  active: PagePosition | null,
): { page: { pos: number; number: number; kind: string } | null; total: number } {
  const position = active?.();
  let page: { pos: number; number: number; kind: string } | null = null;
  let total = 0;
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name !== 'pdfPage' && node.type.name !== 'studyPage') return;
    total++;
    if (!page || pos === position) page = { pos, number: total, kind: node.type.name };
  });
  return { page, total };
}
