import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteCodeBlock } from '@/features/documents/lib/noteCodeBlock';
import { NoteCodeBlockView } from './NoteCodeBlockView';

export const EditableNoteCodeBlock = NoteCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteCodeBlockView, {
      contentDOMElementTag: 'span',
      // Clicks on an icon or label inside a button must stay outside ProseMirror,
      // just like clicks directly on the button itself.
      stopEvent: ({ event }) =>
        event.target instanceof Element &&
        Boolean(
          event.target.closest(
            '.note-mermaid-toolbar, .note-mermaid-help, .note-mermaid-preview, .note-mermaid-copy-status',
          ),
        ),
    });
  },
});
