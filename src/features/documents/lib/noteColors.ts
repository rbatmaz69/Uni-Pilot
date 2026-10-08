import { Mark } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';

// Document colors have stable portable values; the editor uses the same palette in its menus.
export const NOTE_COLORS = [
  { id: 'red', label: 'Red', ink: '#b13948', fill: '#f7d9de' },
  { id: 'orange', label: 'Orange', ink: '#a85c18', fill: '#ffe0bd' },
  { id: 'yellow', label: 'Yellow', ink: '#8d6c13', fill: '#fff0a6' },
  { id: 'green', label: 'Green', ink: '#237b64', fill: '#d4eee0' },
  { id: 'teal', label: 'Teal', ink: '#167e7b', fill: '#d3efec' },
  { id: 'blue', label: 'Blue', ink: '#365ac4', fill: '#d5e5ff' },
  { id: 'purple', label: 'Purple', ink: '#7950ad', fill: '#e8dcfa' },
  { id: 'pink', label: 'Pink', ink: '#b33570', fill: '#f9d9e9' },
  { id: 'gray', label: 'Gray', ink: '#697580', fill: '#e3e7eb' },
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number]['id'];
export const noteColor = (value: unknown) => NOTE_COLORS.find((color) => color.id === value);

export const NoteTextColor = Mark.create({
  name: 'textColor',
  addAttributes: () => ({
    color: {
      default: null,
      parseHTML: (element) => noteColor(element.getAttribute('data-note-color'))?.id ?? null,
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [
    {
      tag: 'span[data-note-color]',
      getAttrs: (element) => (noteColor(element.getAttribute('data-note-color')) ? {} : false),
    },
  ],
  renderHTML({ mark }) {
    const color = noteColor(mark.attrs.color);
    return ['span', color ? { 'data-note-color': color.id, style: `color: ${color.ink}` } : {}, 0];
  },
  renderMarkdown(node, helpers) {
    const color = noteColor(node.attrs?.color);
    const text = helpers.renderChildren(node);
    return color
      ? `<span data-note-color="${color.id}" style="color: ${color.ink}">${text}</span>`
      : text;
  },
});

export const NoteHighlight = Highlight.extend({
  addAttributes: () => ({
    color: {
      default: null,
      parseHTML: (element) => noteColor(element.getAttribute('data-note-highlight'))?.id ?? null,
      renderHTML: () => ({}),
    },
  }),
  renderHTML({ mark }) {
    const color = noteColor(mark.attrs.color);
    return [
      'mark',
      color
        ? {
            'data-note-highlight': color.id,
            style: `background-color: ${color.fill}; color: inherit`,
          }
        : {},
      0,
    ];
  },
  renderMarkdown(node, helpers) {
    const color = noteColor(node.attrs?.color);
    const text = helpers.renderChildren(node);
    return color
      ? `<mark data-note-highlight="${color.id}" style="background-color: ${color.fill}; color: inherit">${text}</mark>`
      : `==${text}==`;
  },
});
