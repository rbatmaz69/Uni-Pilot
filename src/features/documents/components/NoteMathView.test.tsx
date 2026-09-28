import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from '@/features/documents/lib/markdown';
import { insertFormula } from '@/features/documents/lib/noteMath';
import { EditableNoteBlockMath, EditableNoteInlineMath } from './NoteMath';

// jsdom has no layout. ProseMirror asks `elementFromPoint` where a press
// landed; without it every press in these tests throws after the test ends.
// Only here: the note editor reads its absence to pick its test surface.
beforeEach(() => {
  document.elementFromPoint = () => null;
});
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});

let editor: Editor;
afterEach(async () => {
  await act(async () => {
    editor?.destroy();
    await Promise.resolve();
  });
});

async function open(content: JSONContent[], editable = true) {
  editor = new Editor({
    extensions: noteExtensions({
      inlineMath: EditableNoteInlineMath,
      blockMath: EditableNoteBlockMath,
    }),
    editable,
    editorProps: { handleScrollToSelection: () => true },
    content: { type: 'doc', content },
  });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<EditorContent editor={editor} />);
    await Promise.resolve();
  });
  return view;
}

const saved = () => composeNote('', editor.getMarkdown());
const field = () => screen.getByRole('textbox', { name: 'Formula in LaTeX' });
const text = (value: string): JSONContent => ({ type: 'text', text: value });
/** A press and release, as a click on a formula arrives (see NoteMathView). */
function press(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
}

describe('editing formulas', () => {
  it('typesets an inline formula and edits its LaTeX on a click', async () => {
    const view = await open([
      {
        type: 'paragraph',
        content: [text('Area '), { type: 'inlineMath', attrs: { latex: 'r^2' } }],
      },
    ]);
    expect(view.container.querySelector('.katex')).not.toBeNull();
    press(view.container.querySelector('.note-math-render')!);
    fireEvent.change(field(), { target: { value: '\\pi r^2' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(saved()).toBe('Area $\\pi r^2$\n');
    expect(screen.queryByRole('textbox', { name: 'Formula in LaTeX' })).toBeNull();
  });

  it('shows why LaTeX cannot be typeset while typing', async () => {
    const view = await open([{ type: 'blockMath', attrs: { latex: 'x' } }]);
    press(view.container.querySelector('.note-math-render')!);
    fireEvent.change(field(), { target: { value: '\\frac{1}{' } });
    expect(view.container.querySelector('.note-math-hint.is-error')?.textContent).toMatch(/\S/);
  });

  it('keeps the old formula when editing is cancelled with Escape', async () => {
    const view = await open([{ type: 'blockMath', attrs: { latex: 'E = mc^2' } }]);
    press(view.container.querySelector('.note-math-render')!);
    fireEvent.change(field(), { target: { value: 'E = ' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(saved()).toBe('$$\nE = mc^2\n$$\n');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('adds a new line to a block formula with Shift+Enter and finishes with Enter', async () => {
    const view = await open([{ type: 'blockMath', attrs: { latex: 'a' } }, { type: 'paragraph' }]);
    press(view.container.querySelector('.note-math-render')!);
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(field()).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'a \\\\\nb' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(saved()).toBe('$$\na \\\\\nb\n$$\n');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('opens a new formula for typing and removes it when left empty', async () => {
    await open([{ type: 'paragraph', content: [text('Mass ')] }]);
    act(() => {
      editor.commands.setTextSelection(6);
      insertFormula(editor, false);
    });
    // The view renders asynchronously and takes the focus a frame later.
    await waitFor(() => expect(field()).toHaveFocus());
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(editor.getJSON().content?.[0]?.content).toEqual([text('Mass ')]);
  });

  it('opens a selected formula with Enter', async () => {
    await open([{ type: 'paragraph' }, { type: 'blockMath', attrs: { latex: 'x' } }]);
    act(() => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 2)));
    });
    act(() => {
      editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })),
      );
    });
    expect(await screen.findByRole('textbox', { name: 'Formula in LaTeX' })).toHaveValue('x');
  });

  it('ignores a release that ends a drag begun elsewhere', async () => {
    const view = await open([{ type: 'blockMath', attrs: { latex: 'x' } }]);
    fireEvent.mouseUp(view.container.querySelector('.note-math-render')!, { button: 0 });
    expect(screen.queryByRole('textbox', { name: 'Formula in LaTeX' })).toBeNull();
  });

  it('only shows formulas in a read-only note', async () => {
    const view = await open(
      [{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x' } }] }],
      false,
    );
    press(view.container.querySelector('.note-math-render')!);
    expect(screen.queryByRole('textbox', { name: 'Formula in LaTeX' })).toBeNull();
  });
});
