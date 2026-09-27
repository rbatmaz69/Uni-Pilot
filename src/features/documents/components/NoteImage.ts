import Image, { type ImageOptions } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteImageView, type NoteImageOptions } from './NoteImageView';

/** Image node whose relative links point at files in the note's workspace folder. */
export const NoteImage = Image.extend<NoteImageOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), notePath: '' };
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
});
