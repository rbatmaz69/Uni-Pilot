import { Editor, type JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { createNoteVisual } from '@/features/documents/lib/noteVisuals';
import { EditableNoteCard, EditableNoteLayout } from './NoteVisual';

let editor: Editor;
afterEach(async () => {
  await act(async () => {
    editor?.destroy();
    await Promise.resolve();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
async function open(visual = createNoteVisual('sticky-yellow'), editable = true) {
  editor = new Editor({
    extensions: noteExtensions({ card: EditableNoteCard, layout: EditableNoteLayout }),
    editable,
    editorProps: { handleScrollToSelection: () => true },
    content: { type: 'doc', content: [paragraph('Before'), visual, paragraph('After')] },
  });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<EditorContent editor={editor} />);
    await Promise.resolve();
  });
  return view;
}
function resizeHandle() {
  return screen.getByRole('button', { name: 'Resize sticky' });
}
function dragResize(cancel = false) {
  // jsdom does not provide PointerEvent or layout; supply only those browser primitives.
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.classList.contains('tiptap') ? 700 : 360;
    const height = this.classList.contains('note-visual-card-body') ? 145 : 177;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    };
  });
  fireEvent.pointerDown(resizeHandle(), { button: 0, clientX: 350, clientY: 150, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 450, clientY: 200, pointerId: 1 });
  if (cancel) fireEvent.keyDown(window, { key: 'Escape' });
  else fireEvent.pointerUp(window, { clientX: 450, clientY: 200, pointerId: 1 });
}

describe('editable note objects', () => {
  it('enters text editing from blank space and the explicit Edit button', async () => {
    const view = await open();
    fireEvent.mouseDown(view.container.querySelector('.note-visual-card-body')!, { button: 0 });
    expect(editor.isActive('noteCard')).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    act(() => {
      editor.commands.insertContent('New ');
      editor.commands.setTextSelection(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit sticky' }));
    expect(editor.state.selection.$from.parent.textContent).toBe('New Write an idea…');
    expect(editor.state.doc.child(0).textContent).toBe('Before');
    expect(editor.state.doc.child(2).textContent).toBe('After');
  });

  it('resizes both dimensions in one undoable change and keeps existing text edits', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit sticky' }));
    act(() => {
      editor.commands.insertContent('Edited ');
    });
    dragResize();
    expect(editor.state.doc.child(1).attrs).toMatchObject({ width: 460, height: 195 });
    expect(editor.state.doc.child(1).textContent).toBe('Edited Write an idea…');
    act(() => {
      editor.commands.undo();
    });
    expect(editor.state.doc.child(1).attrs).toMatchObject({ width: null, height: null });
    expect(editor.state.doc.child(1).textContent).toBe('Edited Write an idea…');
    act(() => {
      editor.commands.redo();
    });
    expect(editor.state.doc.child(1).attrs.width).toBe(460);
  });

  it('cancels a resize with Escape without saving a partial size', async () => {
    await open();
    const before = editor.getJSON();
    dragResize(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it('changes alignment, color and exact sizes, then resets the size', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'sticky options' }));
    const settings = screen.getByRole('dialog', { name: 'sticky settings' });
    fireEvent.click(within(settings).getByRole('button', { name: 'Align right' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'mint card' }));
    const width = within(settings).getByRole('spinbutton', { name: 'Object width' });
    fireEvent.change(width, { target: { value: '480' } });
    expect(editor.state.doc.child(1).attrs.width).toBeNull();
    fireEvent.blur(width);
    expect(editor.state.doc.child(1).attrs).toMatchObject({
      width: 480,
      align: 'right',
      tone: 'mint',
    });
    fireEvent.click(within(settings).getByRole('button', { name: 'Reset size' }));
    expect(editor.state.doc.child(1).attrs.width).toBeNull();
    expect(editor.state.doc.child(1).textContent).toBe('Write an idea…');
  });

  it('moves an object between paragraphs with undo and no text loss', async () => {
    await open();
    const before = editor.getJSON();
    fireEvent.click(screen.getByRole('button', { name: 'sticky options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    expect(editor.state.doc.child(1).textContent).toBe('After');
    expect(editor.state.doc.child(2).type.name).toBe('noteCard');
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it('reorders nested cards through the keyboard and respects layout boundaries', async () => {
    await open(createNoteVisual('compare'));
    const handles = screen.getAllByRole('button', { name: 'Move sticky' });
    fireEvent.keyDown(handles[0]!, { key: 'ArrowUp', altKey: true });
    expect(editor.state.doc.child(1).child(0).textContent).toContain('Option A');
    fireEvent.keyDown(handles[0]!, { key: 'ArrowDown', altKey: true });
    expect(editor.state.doc.child(1).child(0).textContent).toContain('Option B');
    expect(editor.state.doc.child(1).child(1).textContent).toContain('Option A');
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(1).childCount).toBe(2);
  });

  it('supports keyboard resizing and hides all object controls in read-only notes', async () => {
    await open();
    fireEvent.keyDown(resizeHandle(), { key: 'ArrowRight' });
    expect(editor.state.doc.child(1).attrs.width).toBe(180);
    act(() => {
      editor.setEditable(false);
    });
    expect(screen.queryByRole('button', { name: 'Resize sticky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit sticky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move sticky' })).not.toBeInTheDocument();
  });
});
