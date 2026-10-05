import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  editSelectedFormula,
  NoteBlockMath,
  NoteInlineMath,
} from '@/features/documents/lib/noteMath';
import { BlockMathView, InlineMathView } from './NoteMathView';

export const EditableNoteInlineMath = NoteInlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, { as: 'span' });
  },
  addKeyboardShortcuts() {
    return { Enter: () => editSelectedFormula(this.editor, 'inlineMath') };
  },
});

export const EditableNoteBlockMath = NoteBlockMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView);
  },
  addKeyboardShortcuts() {
    return { Enter: () => editSelectedFormula(this.editor, 'blockMath') };
  },
});
