import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, it, expect, beforeEach } from 'vitest';
import type { ReactNodeViewProps } from '@tiptap/react';
import { NotePdfView } from './NotePdfView';
const acquire = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/features/documents/lib/studyPdfResource', () => ({ acquireStudyPdf: acquire }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));
function props(view = 'card') {
  return {
    node: { attrs: { src: './attachments/course.pdf', name: 'Course.pdf', size: 2048, view } },
    extension: { options: { notePath: 'notes/example.md' } },
    editor: { isEditable: true },
    updateAttributes: vi.fn(),
    selected: false,
  } as unknown as ReactNodeViewProps;
}
beforeEach(() => {
  vi.clearAllMocks();
});
it('keeps the compact card lazy and persists the chosen display mode', () => {
  const input = props();
  render(<NotePdfView {...input} />);
  expect(screen.getByText('Course.pdf')).toBeInTheDocument();
  expect(screen.getByText('2 KB')).toBeInTheDocument();
  expect(acquire).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'PDF view' }), {
    target: { value: 'embed' },
  });
  expect(input.updateAttributes).toHaveBeenCalledWith({ view: 'embed' });
});
it('downloads the resolved workspace attachment', async () => {
  invoke.mockResolvedValue('Course.pdf');
  render(<NotePdfView {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download Course.pdf' }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('download_document', {
      path: 'notes/attachments/course.pdf',
    }),
  );
  expect(await screen.findByText('Course.pdf saved to Downloads')).toBeInTheDocument();
});
it('shows a missing attachment error and releases its PDF resource', async () => {
  const release = vi.fn();
  acquire.mockReturnValue({ promise: Promise.reject(new Error('missing')), release });
  const { unmount } = render(<NotePdfView {...props('embed')} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This PDF could not be loaded');
  expect(screen.getByRole('button', { name: 'Next PDF page' })).toBeDisabled();
  unmount();
  expect(release).toHaveBeenCalledOnce();
});
it('rejects external PDF sources without fetching them', () => {
  const input = props('embed');
  const external = {
    ...input.node,
    attrs: { ...input.node.attrs, src: 'https://example.com/course.pdf' },
  } as unknown as ReactNodeViewProps['node'];
  render(<NotePdfView {...input} node={external} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Only PDF attachments in this workspace');
  expect(acquire).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Download Course.pdf' })).toBeDisabled();
});

it('bounds page navigation and cancels rendering when the embed closes', async () => {
  const cancel = vi.fn();
  const release = vi.fn();
  const getPage = vi.fn().mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: new Promise(() => undefined), cancel }),
    cleanup: vi.fn(),
  });
  acquire.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), release });
  const { unmount } = render(<NotePdfView {...props('embed')} />);
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous PDF page' })).toBeDisabled();
  await waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
  fireEvent.click(screen.getByRole('button', { name: 'Next PDF page' }));
  expect(await screen.findByText('2 / 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next PDF page' })).toBeDisabled();
  await waitFor(() => expect(getPage).toHaveBeenCalledWith(2));
  expect(cancel).toHaveBeenCalledOnce();
  unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledOnce();
});

it('clears a failed load while retrying and acquires a fresh resource', async () => {
  const release = vi.fn();
  acquire.mockReturnValueOnce({ promise: Promise.reject(new Error('missing')), release });
  acquire.mockReturnValueOnce({ promise: new Promise(() => undefined), release: vi.fn() });
  render(<NotePdfView {...props('embed')} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Loading PDF…')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(acquire).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledOnce();
});

it('checks editability when switching views after the editor is locked', () => {
  const input = props();
  render(<NotePdfView {...input} />);
  Object.defineProperty(input.editor, 'isEditable', { value: false });
  fireEvent.change(screen.getByRole('combobox', { name: 'PDF view' }), {
    target: { value: 'embed' },
  });
  expect(input.updateAttributes).not.toHaveBeenCalled();
});
