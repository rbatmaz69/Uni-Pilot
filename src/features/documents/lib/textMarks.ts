import type { Editor } from '@tiptap/core';
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react';

/** The inline marks the toolbars offer, in the order they show them. All are Markdown. */
export type MarkName = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'code';

export const MARKS: {
  name: MarkName;
  label: string;
  Icon: LucideIcon;
  toggle: (editor: Editor) => void;
}[] = [
  {
    name: 'bold',
    label: 'Bold',
    Icon: Bold,
    toggle: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    label: 'Italic',
    Icon: Italic,
    toggle: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: 'underline',
    label: 'Underline',
    Icon: Underline,
    toggle: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    name: 'strike',
    label: 'Strikethrough',
    Icon: Strikethrough,
    toggle: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    name: 'highlight',
    label: 'Highlight',
    Icon: Highlighter,
    toggle: (editor) => editor.chain().focus().toggleHighlight().run(),
  },
  {
    name: 'code',
    label: 'Inline code',
    Icon: Code,
    toggle: (editor) => editor.chain().focus().toggleCode().run(),
  },
];
