import { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { noteExtensions } from './markdown';
import { attachmentTarget, insertAttachments } from './noteAttachments';
import { uploadDocument } from './files';

vi.mock('./files', () => ({ MAX_UPLOAD_BYTES: 25 * 1024 * 1024, uploadDocument: vi.fn() }));
let editor: Editor;
afterEach(() => {
  editor?.destroy();
  vi.clearAllMocks();
});
function open() {
  editor = new Editor({
    extensions: noteExtensions(),
    content: 'Before\n\nAfter',
    contentType: 'markdown',
  });
  editor.commands.setTextSelection(7);
  return editor;
}
function pdf() {
  return {
    name: 'Lecture.pdf',
    type: 'application/pdf',
    size: 4,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as File;
}
it('keeps PDF uploads at the original position while the cursor moves', async () => {
  open();
  let finish!: (value: { src: string }) => void;
  vi.mocked(uploadDocument).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const upload = insertAttachments(editor, [pdf()], 'Notes/topic.md', vi.fn());
  await vi.waitFor(() => expect(finish).toBeDefined());
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  finish({ src: 'attachments/Lecture.pdf' });
  await upload;
  expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
    'paragraph',
    'notePdf',
    'paragraph',
  ]);
  expect(editor.getJSON().content?.[1]?.attrs).toMatchObject({
    name: 'Lecture.pdf',
    size: 4,
    view: 'embed',
  });
});
it('maps a picker position through edits made before the selected block', async () => {
  open();
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const target = attachmentTarget(editor);
  editor.commands.insertContentAt(1, 'New ');
  vi.mocked(uploadDocument).mockResolvedValue({ src: 'attachments/Lecture.pdf' });
  await insertAttachments(editor, [pdf()], 'Notes/topic.md', vi.fn(), target);
  const nodes = editor.getJSON().content ?? [];
  expect(nodes.findIndex((node) => node.type === 'notePdf')).toBe(2);
  expect(editor.state.doc.child(0).textContent).toBe('New Before');
  expect(editor.state.doc.child(1).textContent).toBe('After');
});
it('rejects oversized files and protects a note locked during upload', async () => {
  open();
  const report = vi.fn();
  await insertAttachments(editor, [{ ...pdf(), size: 26 * 1024 * 1024 }], 'Notes/topic.md', report);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
  expect(uploadDocument).not.toHaveBeenCalled();
  vi.mocked(uploadDocument).mockImplementation(() => {
    editor.setEditable(false);
    return Promise.resolve({ src: 'attachments/Lecture.pdf' });
  });
  await insertAttachments(editor, [pdf()], 'Notes/topic.md', report);
  expect(editor.getJSON().content?.some((node) => node.type === 'notePdf')).toBe(false);
});
it('adds mixed image and PDF files in order and reports failed uploads', async () => {
  open();
  const report = vi.fn();
  vi.mocked(uploadDocument)
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValueOnce({ src: 'attachments/Lecture.pdf' })
    .mockResolvedValueOnce({ src: 'attachments/screenshot.png' });
  const image = { ...pdf(), name: 'screenshot.png', type: 'image/png' };
  await insertAttachments(editor, [pdf(), pdf(), image], 'Notes/topic.md', report);
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Storage unavailable') as unknown,
    }),
  );
  const nodes = editor.getJSON().content ?? [];
  expect(
    nodes.filter((node) => ['notePdf', 'image'].includes(node.type ?? '')).map((node) => node.type),
  ).toEqual(['notePdf', 'image']);
});
it.each(['', 'Before'])(
  'retains every PDF when several are uploaded at the end of %j',
  async (content) => {
    editor = new Editor({ extensions: noteExtensions(), content, contentType: 'markdown' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    vi.mocked(uploadDocument).mockResolvedValue({ src: 'attachments/Lecture.pdf' });
    await insertAttachments(editor, [pdf(), pdf(), pdf()], 'Notes/topic.md', vi.fn());
    expect(editor.getJSON().content?.filter((node) => node.type === 'notePdf')).toHaveLength(3);
  },
);
