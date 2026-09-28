import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentExplorer } from '@/features/documents/components/DocumentExplorer';
import { documentRequest, type DocumentEntry } from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { NAV_ITEMS } from '@/lib/navigation';
import { readDocumentDrag } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import { createDataTransfer } from '@/test/dataTransfer';
import { renderApp } from '@/test/render';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
  uploadDocument: vi.fn(),
}));
vi.mock('@/lib/icsFetch', () => ({ isDesktopRuntime: vi.fn() }));
vi.mock('@/features/documents/components/PdfPreview', () => ({
  default: () => <div aria-label="PDF viewer" />,
}));

const request = vi.mocked(documentRequest);
const notes: DocumentEntry = {
  name: 'Notes.md',
  path: 'Notes.md',
  folder: false,
  size: 12,
  modified: 1000,
};
const biology: DocumentEntry = {
  name: 'Biology',
  path: 'Biology',
  folder: true,
  size: 0,
  modified: 1000,
};
const cells: DocumentEntry = {
  name: 'Cells.md',
  path: 'Biology/Cells.md',
  folder: false,
  size: 12,
  modified: 1000,
};
const sidebar = () => screen.getByRole('complementary', { name: 'Main navigation' });
const favorites = () => useSidebarStore.getState().favorites.map((item) => item.path);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearPreviewCache();
  vi.mocked(isDesktopRuntime).mockReturnValue(true);
  request.mockImplementation((action) => {
    if (action.action === 'list')
      return Promise.resolve({
        root: '/Users/student/Documents/Uni Pilot',
        entries: action.path === 'Biology' ? [cells] : action.path ? [] : [notes, biology],
      });
    if (action.action === 'read') return Promise.resolve('# Lecture');
    if (action.action === 'save') return Promise.resolve({ status: 'saved' });
    return Promise.resolve();
  });
});

describe('Favorites in the sidebar', () => {
  it('opens a favorite folder and lights it up instead of Documents', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({
      favorites: [{ path: 'Biology', name: 'Biology', folder: true }],
    });
    renderApp(NAV_ITEMS.dashboard.path);

    await user.click(within(sidebar()).getByRole('link', { name: 'Biology' }));

    expect(await screen.findByRole('tab', { name: 'Biology' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() =>
      expect(within(sidebar()).getByRole('link', { name: 'Biology' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(within(sidebar()).getByRole('link', { name: 'Documents' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(request).toHaveBeenCalledWith({ action: 'list', path: 'Biology' });
  });

  it('opens a favorite note in the editor', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({
      favorites: [{ path: 'Biology/Cells.md', name: 'Cells.md', folder: false }],
    });
    renderApp(NAV_ITEMS.dashboard.path);

    await user.click(within(sidebar()).getByRole('link', { name: 'Cells' }));

    expect(await screen.findByRole('textbox', { name: 'Document content' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({ action: 'read', path: 'Biology/Cells.md' });
  });

  it('adds and removes the selected document from its toolbar', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);

    await user.click(await screen.findByRole('button', { name: 'Select Notes.md' }));
    await user.click(screen.getByRole('button', { name: 'Add to Favorites' }));
    expect(favorites()).toEqual(['Notes.md']);

    await user.click(screen.getByRole('button', { name: 'Remove from Favorites' }));
    expect(favorites()).toEqual([]);
  });

  it('follows a renamed document', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({
      favorites: [{ path: 'Notes.md', name: 'Notes.md', folder: false }],
    });
    render(<DocumentExplorer />);

    await user.click(await screen.findByRole('button', { name: 'Select Notes.md' }));
    await user.click(screen.getByRole('button', { name: 'Rename selected item' }));
    const name = within(screen.getByRole('dialog', { name: 'Rename item' })).getByRole('textbox', {
      name: 'Name',
    });
    await user.clear(name);
    await user.type(name, 'Summary.md');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(useSidebarStore.getState().favorites).toEqual([
        { path: 'Summary.md', name: 'Summary.md', folder: false },
      ]),
    );
  });

  it('forgets a document moved to Recently deleted', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({
      favorites: [{ path: 'Notes.md', name: 'Notes.md', folder: false }],
    });
    render(<DocumentExplorer />);

    await user.click(await screen.findByRole('button', { name: 'Select Notes.md' }));
    await user.click(screen.getByRole('button', { name: 'Move to Recently deleted' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Move to Recently deleted' }),
    );

    await waitFor(() => expect(favorites()).toEqual([]));
  });

  it('lets rows of the documents sidebar be dragged onto the app sidebar', async () => {
    render(<DocumentExplorer />);
    const tree = screen.getByLabelText('Document spaces');
    const row = (await within(tree).findByRole('button', { name: 'Biology' })).closest(
      '[draggable]',
    )!;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row, { dataTransfer });

    expect(readDocumentDrag(dataTransfer)).toEqual({
      path: 'Biology',
      name: 'Biology',
      folder: true,
    });
    expect(useSidebarStore.getState().documentDrag?.path).toBe('Biology');
    fireEvent.dragEnd(row, { dataTransfer });
    expect(useSidebarStore.getState().documentDrag).toBeNull();
  });

  it('keeps a canvas card let go over the sidebar, and puts the card back', async () => {
    // jsdom has neither coordinates on pointer events nor hit-testing.
    vi.stubGlobal('PointerEvent', MouseEvent);
    const hitTest = vi.fn<(x: number, y: number) => Element | null>(() => null);
    document.elementFromPoint = hitTest;
    try {
      renderApp(NAV_ITEMS.documents.path);
      const card = await screen.findByRole('button', { name: 'Select Notes.md' });
      await waitFor(() =>
        expect(localStorage.getItem('uni-pilot:document-canvas:v1')).toContain('Notes.md'),
      );
      const { left, top } = card.style;
      const nav = within(sidebar()).getByRole('navigation', { name: 'Sections' });
      hitTest.mockImplementation((x) => (x < 100 ? nav : null));

      fireEvent.pointerDown(card, { button: 0, clientX: 300, clientY: 200 });
      fireEvent.pointerMove(card, { clientX: 40, clientY: 200 });
      expect(useSidebarStore.getState().documentDragOver).toBe(true);
      expect(within(sidebar()).getByRole('group', { name: 'Favorites' })).toHaveAttribute(
        'data-over',
      );
      fireEvent.pointerUp(card, { clientX: 40, clientY: 200 });

      expect(favorites()).toEqual(['Notes.md']);
      expect(within(sidebar()).getByRole('link', { name: 'Notes' })).toBeInTheDocument();
      expect(card.style.left).toBe(left);
      expect(card.style.top).toBe(top);
      expect(useSidebarStore.getState().documentDrag).toBeNull();
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'move' }));
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });
});
