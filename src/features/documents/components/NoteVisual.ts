import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteCard, NoteLayout } from '@/features/documents/lib/noteVisuals';
import { NoteVisualView } from './NoteVisualView';

export const EditableNoteCard = NoteCard.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteVisualView);
  },
});
export const EditableNoteLayout = NoteLayout.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteVisualView);
  },
});
