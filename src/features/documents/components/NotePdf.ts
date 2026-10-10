import { ReactNodeViewRenderer } from '@tiptap/react';
import { NotePdf } from '@/features/documents/lib/notePdf';
import { NotePdfView } from './NotePdfView';

export const EditableNotePdf = NotePdf.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NotePdfView);
  },
});
