import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { Editor, EditorContent } from '@tiptap/react';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { EditablePdfPage, EditableStudyPage } from '@/features/documents/components/StudyPage';
import { StudyAnnotationToolbar } from '@/features/documents/components/StudyAnnotationToolbar';
vi.mock('@/features/documents/lib/studyPdfResource', () => ({
  acquireStudyPdf: () => ({ promise: Promise.resolve({}), release: () => {} }),
}));
vi.mock('@/features/documents/components/StudyPdfCanvas', () => ({
  StudyPdfCanvas: () => <div>Original PDF</div>,
}));
let editor: Editor;
afterEach(() => {
  editor?.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mountStudyEditor() {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('PointerEvent', undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  editor = new Editor({
    extensions: noteExtensions({
      pdfPage: EditablePdfPage.configure({ notePath: 'Lecture.md' }),
      studyPage: EditableStudyPage,
    }),
    content: {
      type: 'doc',
      content: [
        {
          type: 'pdfPage',
          attrs: { src: 'attachments/original.pdf', page: 1, width: 842, height: 595, ink: '[]' },
        },
        {
          type: 'studyPage',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meine Lösung' }] }],
        },
        {
          type: 'pdfPage',
          attrs: { src: 'attachments/original.pdf', page: 2, width: 842, height: 595, ink: '[]' },
        },
      ],
    },
  });
  render(
    <>
      <StudyAnnotationToolbar editor={editor} report={vi.fn()} />
      <EditorContent editor={editor} />
    </>,
  );
}
it('commits PDF text and strokes into the same Markdown document and keeps rich notes editable', async () => {
  mountStudyEditor();
  await screen.findAllByText('Original PDF');
  const layer = screen.getAllByRole('img', { name: /Zeichenfläche/ })[0]!;
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 842,
    height: 595,
    bottom: 595,
    right: 842,
    toJSON: () => ({}),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Text' }));
  fireEvent.click(layer, { button: 0, clientX: 20, clientY: 30 });
  const field = await screen.findByRole('textbox', { name: 'Text auf der Seite' });
  fireEvent.change(field, { target: { value: 'PDF-Lösung ä😀' } });
  fireEvent.blur(field);
  await waitFor(() => expect(editor.getMarkdown()).toContain('PDF-Lösung ä😀'));
  fireEvent.click(screen.getByRole('button', { name: 'Stift' }));
  fireEvent.mouseDown(layer, { button: 0, clientX: 10, clientY: 20 });
  fireEvent.mouseMove(layer, { button: 0, clientX: 30, clientY: 40 });
  fireEvent.mouseUp(layer, { button: 0, clientX: 30, clientY: 40 });
  await waitFor(() => expect(editor.getMarkdown()).toContain('"type":"pen"'));
  const source = editor.getJSON().content?.[0];
  const ink = JSON.parse(String(source?.attrs?.ink)) as Array<{
    type: string;
    points?: Array<{ x: number; y: number }>;
  }>;
  expect(ink.map((a) => a.type)).toEqual(['text', 'pen']);
  expect(ink[1]?.points).toEqual([
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ]);
  expect(editor.getMarkdown()).toContain('Meine Lösung');
  editor.commands.undo();
  expect(editor.getMarkdown()).not.toContain('"type":"pen"');
});

it('keeps an open PDF text field from changing a note after a save conflict makes it read-only', async () => {
  mountStudyEditor();
  await screen.findAllByText('Original PDF');
  const layer = screen.getAllByRole('img', { name: /Zeichenfläche/ })[0]!;
  fireEvent.click(screen.getByRole('button', { name: 'Text' }));
  fireEvent.click(layer, { button: 0, clientX: 20, clientY: 30 });
  const field = await screen.findByRole('textbox', { name: 'Text auf der Seite' });
  fireEvent.change(field, { target: { value: 'Noch nicht übernommen' } });
  const saved = editor.getMarkdown();
  act(() => editor.setEditable(false));
  fireEvent.blur(field);
  expect(editor.getMarkdown()).toBe(saved);
  expect(screen.getByRole('button', { name: 'Stift' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Text' })).toBeDisabled();
});

it('shares a single toolbar across pages and inserts a writable sheet exactly between the chosen pages', async () => {
  mountStudyEditor();
  await screen.findAllByText('Original PDF');
  expect(screen.getAllByRole('toolbar', { name: 'Dokument bearbeiten' })).toHaveLength(1);
  expect(screen.queryByRole('toolbar', { name: /Werkzeuge für PDF/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stift' }));
  fireEvent.click(screen.getByRole('button', { name: 'Blau' }));
  expect(
    screen
      .getAllByRole('img', { name: /Zeichenfläche/ })
      .every((layer) => layer.classList.contains('document-tool-pen')),
  ).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Notizseite hier einfügen' })[0]!);
  await waitFor(() => expect(editor.state.selection.$from.node(1).type.name).toBe('studyPage'));
  expect(
    editor
      .getJSON()
      .content?.filter((node) => node.type !== 'paragraph')
      .map((node) => node.type),
  ).toEqual(['pdfPage', 'studyPage', 'studyPage', 'pdfPage']);
  expect(screen.getByRole('button', { name: 'Auswählen' })).toHaveAttribute('aria-pressed', 'true');
  act(() => {
    editor.commands.insertContent('Neue Lösung direkt auf der Seite');
  });
  expect(editor.state.doc.child(1).textContent).toBe('Neue Lösung direkt auf der Seite');
  expect(editor.getMarkdown()).toContain('Meine Lösung');
  fireEvent.click(
    within(screen.getByRole('toolbar', { name: 'Dokument bearbeiten' })).getByRole('button', {
      name: 'Notizseite',
    }),
  );
  expect(
    editor
      .getJSON()
      .content?.filter((node) => node.type !== 'paragraph')
      .map((node) => node.type),
  ).toEqual(['pdfPage', 'studyPage', 'studyPage', 'studyPage', 'pdfPage']);
});
