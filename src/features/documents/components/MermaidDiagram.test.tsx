import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from '@/features/documents/lib/markdown';
import {
  createMermaidBlock,
  MERMAID_EXAMPLE,
  renderMermaid,
} from '@/features/documents/lib/mermaid';
import { EditableNoteCodeBlock } from './NoteCodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import { NoteVisualPreview } from './NoteVisualPreview';

vi.mock('@/features/documents/lib/mermaid', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/documents/lib/mermaid')>()),
  renderMermaid: vi.fn(),
}));
const svg = '<svg viewBox="0 0 100 50"><text>Study flow</text></svg>';
let editor: Editor | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(renderMermaid).mockReset().mockResolvedValue(svg);
});
afterEach(async () => {
  await act(async () => {
    editor?.destroy();
    await Promise.resolve();
  });
  editor = undefined;
  vi.useRealTimers();
});
async function renderPending() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301);
  });
}
async function openEditor(editable = true) {
  editor = new Editor({
    extensions: noteExtensions({ codeBlock: EditableNoteCodeBlock }),
    editable,
    content: {
      type: 'doc',
      content: [
        createMermaidBlock(),
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    },
    editorProps: { handleScrollToSelection: () => true },
  });
  // Start reading below the diagram, as when reopening a note.
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  await act(async () => {
    render(<EditorContent editor={editor!} />);
    await Promise.resolve();
  });
  return editor;
}

describe('Mermaid previews and editor controls', () => {
  it('debounces rendering and ignores obsolete results after an edit', async () => {
    let finishOld!: (svg: string) => void;
    vi.mocked(renderMermaid).mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const view = render(<MermaidDiagram source="flowchart LR\nA-->B" />);
    await renderPending();
    view.rerender(<MermaidDiagram source="flowchart LR\nB-->C" />);
    await renderPending();
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toHaveTextContent('Study flow');
    await act(async () => {
      finishOld('<svg><text>Obsolete</text></svg>');
      await Promise.resolve();
    });
    expect(screen.queryByText('Obsolete')).not.toBeInTheDocument();
  });

  it('keeps a clearly marked last successful preview and recovers after syntax errors', async () => {
    const view = render(<MermaidDiagram source={MERMAID_EXAMPLE} />);
    await renderPending();
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error('Parse error on line 2'));
    view.rerender(<MermaidDiagram source="invalid" />);
    await renderPending();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Mermaid diagram — preview of previous code',
    );
    expect(screen.getByText(/Preview is out of date.*Parse error on line 2/)).toBeInTheDocument();
    view.rerender(<MermaidDiagram source="flowchart LR\nC-->D" />);
    await renderPending();
    expect(screen.queryByText(/Parse error/)).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('Mermaid diagram');
  });

  it('opens real editor content, saves edits, and finishes below the diagram', async () => {
    const current = await openEditor();
    const updates = vi.fn();
    current.on('update', updates);
    await renderPending();
    expect(updates).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mermaid code').closest('pre')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Mermaid code' }));
    await waitFor(() => expect(screen.getByLabelText('Mermaid code').closest('pre')).toBeVisible());
    act(() => {
      current.commands.insertContent('%% My diagram\n');
    });
    expect(current.getMarkdown()).toContain('%% My diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Done editing Mermaid code' }));
    expect(current.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(screen.getByLabelText('Mermaid code').closest('pre')).not.toBeVisible();
    expect(current.state.doc.childCount).toBe(2);
    act(() => {
      current.commands.undo();
    });
    expect(current.getMarkdown()).not.toContain('%% My diagram');
  });

  it('finishes with the keyboard and displays read-only diagrams without editing controls', async () => {
    const current = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Mermaid code' }));
    // Browsers dispatch editor keys on the contenteditable root, rather than the code span.
    fireEvent.keyDown(current.view.dom, { key: 'Enter', keyCode: 13, ctrlKey: true });
    expect(current.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(screen.getByLabelText('Mermaid code').closest('pre')).not.toBeVisible();
    act(() => {
      current.setEditable(false);
    });
    await renderPending();
    expect(screen.queryByRole('button', { name: 'Edit Mermaid code' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeInTheDocument();
  });

  it('renders Mermaid in the separate document thumbnail renderer', async () => {
    render(
      <NoteVisualPreview
        name="Study.md"
        path="Study.md"
        content={`\`\`\`mermaid\n${MERMAID_EXAMPLE}\n\`\`\``}
        size="large"
      />,
    );
    await renderPending();
    expect(renderMermaid).toHaveBeenCalledWith(MERMAID_EXAMPLE, 'neutral', expect.any(AbortSignal));
    expect(screen.getByText('Study flow')).toBeInTheDocument();
  });
});
