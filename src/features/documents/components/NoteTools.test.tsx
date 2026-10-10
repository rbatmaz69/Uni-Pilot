import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { noteStats } from '@/features/documents/lib/noteOutline';
import { setTextMarker, TextMarker } from '@/features/documents/lib/textMarker';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { NoteTools } from './NoteTools';

let editor: Editor;
let host: HTMLElement;
beforeEach(() => {
  host = document.body.appendChild(document.createElement('section'));
  useNoteStyleStore.setState({
    style: 'standard',
    layout: 'card',
    width: 'normal',
    tone: 'default',
    cover: 'none',
    backdrop: 'paper',
    focus: false,
    markers: false,
    markerOnly: null,
  });
});
afterEach(() => {
  editor?.destroy();
  host.remove();
});
function open(content = 'Keep my notes', disabled = false) {
  editor = new Editor({
    extensions: [...noteExtensions(), TextMarker],
    content,
    contentType: 'markdown',
  });
  const onImage = vi.fn();
  const onCanvas = vi.fn();
  const onPdf = vi.fn();
  const onSearch = vi.fn();
  render(
    <>
      <NoteTools
        editor={editor}
        disabled={disabled}
        onInsertImage={onImage}
        onInsertPdf={onPdf}
        onOpenCanvas={onCanvas}
        onSearch={onSearch}
        readStats={() => noteStats(editor.state.doc)}
        fileName="Study.md"
        keepsProperties={false}
        host={host}
      />
      <EditorContent editor={editor} />
    </>,
  );
  return { onImage, onCanvas, onPdf, onSearch };
}
const tools = () => screen.getByRole('toolbar', { name: 'Page tools' });
function openPanel(button: string, dialog: string) {
  fireEvent.click(within(tools()).getByRole('button', { name: button }));
  return screen.getByRole('dialog', { name: dialog });
}

describe('note tools', () => {
  it('keeps to icons, names the current settings in tooltips and opens popovers in the workspace', () => {
    useNoteStyleStore.setState({ font: 'literata', textSize: 'l' });
    const { onSearch } = open();
    for (const button of within(tools()).getAllByRole('button'))
      expect(button.textContent?.replace(/A[ag]/, '')).toBe('');
    expect(within(tools()).getByRole('button', { name: 'Typography' })).toHaveAttribute(
      'title',
      'Typography: Literata, Large',
    );
    const panel = openPanel('Layout', 'Layout');
    expect(host).toContainElement(panel);
    expect(tools()).not.toContainElement(panel);

    fireEvent.click(within(tools()).getByRole('button', { name: 'Search in note' }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers a searchable PDF upload in Insert', () => {
    const { onPdf } = open();
    const panel = openPanel('Insert', 'Insert');
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search blocks' }), {
      target: { value: 'pdf' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'PDF' }));
    expect(onPdf).toHaveBeenCalledOnce();
  });
  it('opens one popover at a time and restores the trigger on Escape', () => {
    open();
    openPanel('Insert', 'Insert');
    const text = openPanel('Format text', 'Text');
    expect(screen.queryByRole('dialog', { name: 'Insert' })).not.toBeInTheDocument();
    expect(text).toHaveFocus();
    expect(within(tools()).getByRole('button', { name: 'Format text' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(tools()).getByRole('button', { name: 'Format text' })).toHaveFocus();
  });

  it('closes on a click elsewhere and toggles from its own button', () => {
    open();
    openPanel('Layout', 'Layout');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openPanel('Layout', 'Layout');
    fireEvent.click(within(tools()).getByRole('button', { name: 'Layout' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between its buttons with the arrow keys', () => {
    open();
    const insert = within(tools()).getByRole('button', { name: 'Insert' });
    insert.focus();
    fireEvent.keyDown(insert, { key: 'ArrowRight' });
    expect(within(tools()).getByRole('button', { name: 'Format text' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(within(tools()).getByRole('button', { name: 'Focus mode' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(insert).toHaveFocus();
  });

  it('inserts a block after the current one without overwriting selected text, in one undo step', () => {
    open();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });
    fireEvent.click(within(openPanel('Insert', 'Insert')).getByRole('button', { name: 'Divider' }));
    expect(editor.state.doc.child(0).textContent).toBe('Keep my notes');
    expect(editor.state.doc.child(1).type.name).toBe('horizontalRule');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getMarkdown()).toBe('Keep my notes');
  });

  it('inserts a table with the cursor in a cell and retains it on a Markdown round trip', () => {
    open('');
    fireEvent.click(within(openPanel('Insert', 'Insert')).getByRole('button', { name: 'Table' }));
    expect(editor.isActive('table')).toBe(true);
    expect(editor.state.doc.child(0).childCount).toBe(3);
    act(() => {
      editor.commands.insertContent('Topic');
    });
    const markdown = editor.getMarkdown();
    act(() => {
      editor.commands.setContent(markdown, { contentType: 'markdown' });
    });
    expect(editor.state.doc.child(0).type.name).toBe('table');
    expect(editor.state.doc.child(0).textContent).toContain('Topic');
  });

  it('keeps text styles out of Insert, and visuals on their own tab', () => {
    const { onCanvas } = open();
    const panel = openPanel('Insert', 'Insert');
    for (const name of ['Text', 'Heading', 'Checklist', 'Bulleted list', 'Quote', 'Code block'])
      expect(within(panel).queryByRole('button', { name })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Cornell notes' })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('tab', { name: 'Visuals' }));
    expect(within(panel).getByRole('tab', { name: 'Visuals' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(panel).getByRole('button', { name: 'Cornell notes' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Table' })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Open visual canvas' }));
    expect(onCanvas).toHaveBeenCalled();
  });

  it('searches both tabs and offers a useful empty result', () => {
    open();
    const panel = openPanel('Insert', 'Insert');
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search blocks' }), {
      target: { value: 'Cornell' },
    });
    expect(within(panel).getByRole('button', { name: 'Cornell notes' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Table' })).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('searchbox'), { target: { value: 'latex' } });
    expect(within(panel).getByRole('button', { name: 'Formula' })).toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('searchbox'), { target: { value: 'unknown block' } });
    expect(within(panel).getByText('No blocks found. Try “table” or “study”.')).toBeInTheDocument();
  });

  it('formats selected text and turns the current block into a list from the Text popover', () => {
    open('Study');
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    const panel = openPanel('Format text', 'Text');
    fireEvent.click(within(panel).getByRole('button', { name: 'Bold' }));
    expect(editor.getMarkdown()).toBe('**Study**');
    fireEvent.click(within(panel).getByRole('button', { name: 'Heading 2' }));
    expect(editor.getMarkdown().trim()).toBe('## **Study**');
    expect(within(panel).getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Checklist' }));
    expect(editor.isActive('taskList')).toBe(true);
    act(() => {
      editor.commands.undo();
    });
    expect(editor.isActive('taskList')).toBe(false);
    expect(editor.state.doc.textContent).toBe('Study');
  });

  it('disables inserts and formatting while a note is protected', () => {
    open('Study', true);
    const insert = openPanel('Insert', 'Insert');
    expect(within(insert).getByRole('button', { name: 'Table' })).toBeDisabled();
    fireEvent.click(within(insert).getByRole('tab', { name: 'Visuals' }));
    expect(within(insert).getByRole('button', { name: 'Mint sticky note' })).toBeDisabled();
    const text = openPanel('Format text', 'Text');
    expect(within(text).getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(within(text).getByRole('button', { name: 'Heading 1' })).toBeDisabled();
  });

  it('names the current layout on its button and offers width only where it applies', () => {
    open();
    const button = within(tools()).getByRole('button', { name: 'Layout' });
    expect(button).toHaveAttribute('title', 'Layout: Pageless, Normal');
    const panel = openPanel('Layout', 'Layout');
    fireEvent.click(within(panel).getByRole('radio', { name: 'Wide' }));
    expect(useNoteStyleStore.getState().width).toBe('wide');
    expect(button).toHaveAttribute('title', 'Layout: Pageless, Wide');

    fireEvent.click(within(panel).getByRole('radio', { name: 'Pages' }));
    expect(button).toHaveAttribute('title', 'Layout: Pages, A4');
    expect(within(panel).queryByRole('radiogroup', { name: 'Width' })).not.toBeInTheDocument();
    expect(within(panel).getByText(/A4 sheets keep their width/)).toBeInTheDocument();
  });

  it('switches to the notebook and leaves the notebook’s own tools to it', () => {
    open();
    fireEvent.click(within(openPanel('Layout', 'Layout')).getByRole('radio', { name: 'Notebook' }));
    expect(useNoteStyleStore.getState().style).toBe('notebook');
    expect(within(tools()).getByRole('button', { name: 'Layout' })).toHaveAttribute(
      'title',
      'Layout: Notebook, Dotted paper',
    );
    for (const name of ['Insert', 'Format text', 'Page appearance'])
      expect(within(tools()).queryByRole('button', { name })).not.toBeInTheDocument();
    const type = openPanel('Typography', 'Typography');
    expect(within(type).queryByRole('radiogroup', { name: 'Font' })).not.toBeInTheDocument();
    expect(within(type).getByRole('radiogroup', { name: 'Bold text color' })).toBeInTheDocument();
  });

  it('remembers appearance choices without modifying note content', () => {
    open();
    const page = openPanel('Page appearance', 'Page');
    fireEvent.click(within(page).getByRole('radio', { name: 'Ivory' }));
    fireEvent.click(within(page).getByRole('radio', { name: 'Sage' }));
    fireEvent.click(within(page).getByRole('radio', { name: 'Dots' }));
    expect(useNoteStyleStore.getState()).toMatchObject({
      tone: 'warm',
      cover: 'sage',
      backdrop: 'dots',
    });
    const preview = document.querySelector('.note-style-preview');
    expect(preview).toHaveAttribute('data-tone', 'warm');
    expect(preview).toHaveAttribute('data-backdrop', 'dots');
    expect(editor.getMarkdown()).toBe('Keep my notes');
    expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
      state: { tone: 'warm', cover: 'sage', backdrop: 'dots' },
    });
  });

  it('hides the backdrop where the page fills the window', () => {
    useNoteStyleStore.setState({ layout: 'full' });
    open();
    const page = openPanel('Page appearance', 'Page');
    expect(within(page).queryByRole('radiogroup', { name: 'Backdrop' })).not.toBeInTheDocument();
    expect(within(page).getByText(/no backdrop around the page/)).toBeInTheDocument();
  });

  it('chooses bold colors with the arrow keys while preserving bold and highlighted Markdown', () => {
    const content = 'Context with **bold insight** and ==highlighted essential==.';
    open(content);
    const type = openPanel('Typography', 'Typography');
    const colors = within(type).getByRole('radiogroup', { name: 'Bold text color' });
    const standard = within(colors).getByRole('radio', { name: 'Default' });
    expect(standard).toBeChecked();
    standard.focus();
    for (const label of ['Blue', 'Teal', 'Rose', 'Default']) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(within(colors).getByRole('radio', { name: label })).toBeChecked();
      expect(within(colors).getByRole('radio', { name: label })).toHaveFocus();
      expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
        state: { boldColor: label.toLowerCase() },
      });
      expect(editor.getMarkdown()).toBe(content);
    }
  });

  it('turns the Textmarker on from its popover and spotlights one role from its key', () => {
    const content = 'I think this is great. It was founded in 1998. The bus is red.';
    open(content);
    const button = within(tools()).getByRole('button', { name: 'Textmarker' });
    expect(button).toHaveAttribute('title', 'Textmarker: Off');
    const panel = openPanel('Textmarker', 'Textmarker');
    const fact = within(panel).getByRole('button', { name: 'Fact' });
    expect(fact).toBeDisabled();
    expect(fact).toHaveAccessibleDescription('Numbers, dates and sources');

    fireEvent.click(within(panel).getByRole('switch', { name: /^Mark sentences by role/ }));
    expect(useNoteStyleStore.getState().markers).toBe(true);
    expect(button).toHaveAttribute('title', 'Textmarker: On');
    // What the editor does when the setting changes.
    act(() => setTextMarker(editor.view, { enabled: true, only: null }));
    expect(fact).toHaveAccessibleDescription('38% · Numbers, dates and sources');
    expect(within(panel).getByRole('button', { name: 'Opinion' })).toHaveAccessibleDescription(
      '37% · A view or a judgement',
    );
    expect(within(panel).getByText(/25% has no clear cue/)).toBeInTheDocument();

    fireEvent.click(fact);
    expect(fact).toHaveAttribute('aria-pressed', 'true');
    expect(useNoteStyleStore.getState().markerOnly).toBe('fact');
    fireEvent.click(fact);
    expect(useNoteStyleStore.getState().markerOnly).toBeNull();
    expect(editor.getMarkdown()).toBe(content);
  });

  it('shows each statistic once', () => {
    open('# Plan\n\nRead chapter one\n\n- [ ] Summarise');
    const info = openPanel('Note details', 'Details');
    expect(within(info).getAllByText('Words')).toHaveLength(1);
    expect(within(info).getAllByText('Reading time')).toHaveLength(1);
    expect(within(info).getByText('Open tasks').nextSibling).toHaveTextContent('1 of 1');
    expect(within(info).getByText('Study.md')).toBeInTheDocument();
  });
});
