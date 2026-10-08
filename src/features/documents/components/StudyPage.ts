import { ReactNodeViewRenderer } from '@tiptap/react';
import { NotePdfPage, NoteStudyPage } from '@/features/documents/lib/studyPages';
import { StudySourceView, StudyNoteView } from '@/features/documents/components/StudyPageView';

export const EditablePdfPage = NotePdfPage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(StudySourceView, {
      // PDF tools own their pointer events; ProseMirror must not turn a stroke into a node selection.
      stopEvent: ({ event }) =>
        (event.target instanceof Element &&
          Boolean(event.target.closest('.document-text-editor, .study-pdf-text'))) ||
        !['copy', 'cut', 'paste', 'drop'].includes(event.type),
    });
  },
});
export const EditableStudyPage = NoteStudyPage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(StudyNoteView, {
      stopEvent: ({ event }) =>
        event.target instanceof Element &&
        Boolean(event.target.closest('.study-note-ink, .study-page-caption, .study-page-insert')),
    });
  },
});
