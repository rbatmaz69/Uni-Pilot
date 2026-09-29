import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentExplorer } from '@/features/documents/components/DocumentExplorer';
import {
  documentRequest,
  uploadDocument,
  type DocumentEntry,
  type DocumentRequest,
} from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { isDesktopRuntime } from '@/lib/icsFetch';

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
const upload = vi.mocked(uploadDocument);
const saves = () =>
  request.mock.calls
    .map(([call]) => call)
    .filter((call): call is Extract<DocumentRequest, { action: 'save' }> => call.action === 'save');
const notes: DocumentEntry = {
  name: 'Notes.md',
  path: 'Notes.md',
  folder: false,
  size: 12,
  modified: 1000,
};
const folder: DocumentEntry = {
  name: 'Biology',
  path: 'Biology',
  folder: true,
  size: 0,
  modified: 1000,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearPreviewCache();
  vi.mocked(isDesktopRuntime).mockReturnValue(true);
  request.mockImplementation((action) => {
    if (action.action === 'list')
      return Promise.resolve({
        root: '/Users/student/Documents/Uni Pilot',
        entries: action.path ? [] : [notes, folder],
      });
    if (action.action === 'read') return Promise.resolve('# Lecture');
    if (action.action === 'save') return Promise.resolve({ status: 'saved' });
    return Promise.resolve();
  });
});

/** Answers save requests differently while every other request keeps working. */
function answerSaves(answer: (call: Extract<DocumentRequest, { action: 'save' }>) => unknown) {
  const base = request.getMockImplementation()!;
  request.mockImplementation((action) =>
    action.action === 'save' ? Promise.resolve().then(() => answer(action)) : base(action),
  );
}

async function openNotes() {
  const user = userEvent.setup();
  render(<DocumentExplorer />);
  await user.dblClick(await screen.findByRole('button', { name: 'Select Notes.md' }));
  const editor = await screen.findByRole('textbox', { name: 'Document content' });
  return { user, editor };
}

describe('Document explorer', () => {
  it('shows a folder tree and keeps opened folders in the top tab strip', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    const tree = screen.getByLabelText('Document folders');
    await within(tree).findByRole('button', { name: 'Biology' });
    await user.click(within(tree).getByRole('button', { name: 'Biology' }));
    expect(screen.getByRole('tab', { name: 'Biology' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Biology' })).toBeInTheDocument();
  });

  it('searches documents in folders that have not been expanded', async () => {
    const base = request.getMockImplementation()!;
    request.mockImplementation((action) =>
      action.action === 'search'
        ? Promise.resolve([
            {
              ...notes,
              name: 'Deep notes.md',
              path: 'Biology/Deep notes.md',
              snippet: null,
              matches: 0,
              nameMatch: true,
            },
          ])
        : base(action),
    );
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await user.type(screen.getByRole('textbox', { name: 'Search folder tree' }), 'deep');
    expect(
      await within(screen.getByLabelText('Document folders')).findByRole('button', {
        name: 'Deep notes.md',
      }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({ action: 'search', query: 'deep' });
  });

  it('saves an open note before changing to another document tab', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    const tree = screen.getByLabelText('Document folders');
    await user.click(await within(tree).findByRole('button', { name: 'Notes.md' }));
    expect(screen.getByRole('tab', { name: 'Notes.md' })).toHaveAttribute('aria-selected', 'true');
    await user.type(await screen.findByRole('textbox', { name: 'Document content' }), ' draft');
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    await waitFor(() => expect(saves().at(-1)).toMatchObject({ content: '# Lecture draft' }));
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Notes.md' }));
    expect(await screen.findByRole('textbox', { name: 'Document content' })).toBeInTheDocument();
  });

  it('explains desktop storage without pretending browser files are saved', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false);
    render(<DocumentExplorer />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(screen.getByText(/Your files live on your computer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New document' })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it('browses folders, searches, and switches between list and grid', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await screen.findByRole('button', { name: 'Select Notes.md' });
    await user.click(screen.getByRole('button', { name: 'Search documents' }));
    await user.type(screen.getByRole('textbox', { name: 'Search this folder' }), 'notes');
    expect(screen.queryByRole('button', { name: 'Select Biology' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Canvas options'));
    await user.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.clear(screen.getByRole('textbox', { name: 'Search this folder' }));
    await user.dblClick(screen.getByRole('button', { name: 'Select Biology' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'list', path: 'Biology' }));
    await user.click(screen.getByRole('button', { name: 'Go to parent folder' }));
    await screen.findByRole('button', { name: 'Select Notes.md' });
  });

  it('creates folders in the current directory and keeps failures visible', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await screen.findByRole('button', { name: 'Select Notes.md' });
    await user.click(screen.getByRole('button', { name: 'Add to canvas' }));
    await user.click(screen.getByRole('button', { name: 'New folder' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Chemistry');
    request.mockRejectedValueOnce('An item with this name already exists.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(request).toHaveBeenCalledWith({
      action: 'create',
      path: '',
      name: 'Chemistry',
      folder: true,
    });
  });

  it('saves automatically after a pause, passing the opened text for conflict detection', async () => {
    const { user, editor } = await openNotes();
    await user.type(editor, ' notes');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await waitFor(
      () =>
        expect(saves()).toEqual([
          { action: 'save', path: 'Notes.md', content: '# Lecture notes', expected: '# Lecture' },
        ]),
      { timeout: 3000 },
    );
    expect(await screen.findByText('Saved on your computer')).toBeInTheDocument();
    await user.type(editor, '!');
    await waitFor(
      () =>
        expect(saves().at(-1)).toMatchObject({
          content: '# Lecture notes!',
          expected: '# Lecture notes',
        }),
      { timeout: 3000 },
    );
  });

  it('writes pending edits at once when the note is closed', async () => {
    const { user, editor } = await openNotes();
    await user.type(editor, ' draft');
    await user.click(screen.getByRole('button', { name: 'Back to board' }));
    expect(saves()).toEqual([
      { action: 'save', path: 'Notes.md', content: '# Lecture draft', expected: '# Lecture' },
    ]);
    expect(await screen.findByRole('button', { name: 'Select Notes.md' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument();
  });

  it('still writes the last edits when the page is left with the note open', async () => {
    const user = userEvent.setup();
    const view = render(<DocumentExplorer />);
    await user.dblClick(await screen.findByRole('button', { name: 'Select Notes.md' }));
    await user.type(await screen.findByRole('textbox', { name: 'Document content' }), ' typed');
    view.unmount();
    await waitFor(() =>
      expect(saves()).toEqual([
        { action: 'save', path: 'Notes.md', content: '# Lecture typed', expected: '# Lecture' },
      ]),
    );
  });

  it('switches a note into the notebook style from the layout popover and remembers it', async () => {
    const { user } = await openNotes();
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    const layouts = screen.getByRole('radiogroup', { name: 'Page layout' });
    expect(within(layouts).getByRole('radio', { name: 'Pages' })).toBeChecked();
    expect(screen.queryByRole('region', { name: 'Notebook' })).not.toBeInTheDocument();

    await user.click(within(layouts).getByRole('radio', { name: 'Notebook' }));
    const notebook = screen.getByRole('region', { name: 'Notebook' });
    const paper = within(notebook).getByRole('textbox', { name: 'Document content' });
    expect(paper).toHaveValue('# Lecture');
    expect(within(notebook).getByText('Pages 1–2 of 2')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
      state: { style: 'notebook' },
    });

    // Writing and autosave work the same on paper.
    await user.type(paper, ' on paper');
    await user.keyboard('{Meta>}s{/Meta}');
    expect(saves().at(-1)).toMatchObject({ content: '# Lecture on paper' });

    await user.click(screen.getByRole('button', { name: 'Back to board' }));
    await user.dblClick(await screen.findByRole('button', { name: 'Select Notes.md' }));
    expect(await screen.findByRole('region', { name: 'Notebook' })).toBeInTheDocument();
  });

  it('opens notes on A4 sheets and chooses the page layout with the arrow keys', async () => {
    const { user } = await openNotes();
    const workspace = screen.getByRole('region', { name: 'Edit Notes.md' });
    expect(workspace).toHaveAttribute('data-layout', 'pages');
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    screen.getByRole('radio', { name: 'Pages' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Pageless' })).toHaveFocus();
    expect(workspace).toHaveAttribute('data-layout', 'card');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Full width' })).toHaveFocus();
    expect(workspace).toHaveAttribute('data-layout', 'full');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('region', { name: 'Notebook' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Pages' })).toBeChecked();
    expect(screen.queryByRole('region', { name: 'Notebook' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Document content' })).toBeInTheDocument();
  });

  it('applies font, size, spacing, width and backdrop to every note without touching the file', async () => {
    const { user } = await openNotes();
    const workspace = screen.getByRole('region', { name: 'Edit Notes.md' });
    await user.click(screen.getByRole('button', { name: 'Typography' }));
    const type = screen.getByRole('dialog', { name: 'Typography' });
    await user.click(
      within(within(type).getByRole('radiogroup', { name: 'Font' })).getByRole('radio', {
        name: 'Literata',
      }),
    );
    expect(within(type).getByText(/Google Play Books/)).toBeInTheDocument();
    await user.click(within(type).getByRole('radio', { name: 'Large' }));
    await user.click(within(type).getByRole('radio', { name: 'Compact' }));
    expect(screen.getByRole('button', { name: 'Typography' })).toHaveTextContent('LiterataLarge');

    // Width shapes a page that grows with the text; A4 sheets keep theirs.
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    const layout = screen.getByRole('dialog', { name: 'Layout' });
    await user.click(within(layout).getByRole('radio', { name: 'Pageless' }));
    await user.click(within(layout).getByRole('radio', { name: 'Wide' }));
    await user.click(screen.getByRole('button', { name: 'Page appearance' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Page' })).getByRole('radio', { name: 'Dots' }),
    );
    expect(workspace).toHaveAttribute('data-font', 'literata');
    expect(workspace).toHaveAttribute('data-text-size', 'l');
    expect(workspace).toHaveAttribute('data-line-spacing', 'compact');
    expect(workspace).toHaveAttribute('data-layout', 'card');
    expect(workspace).toHaveAttribute('data-width', 'wide');
    expect(workspace).toHaveAttribute('data-backdrop', 'dots');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Page' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page appearance' })).toHaveFocus();
    expect(saves()).toEqual([]);
  });

  it('shows word count and reading time in the details popover instead of a footer', async () => {
    const { user, editor } = await openNotes();
    await user.type(editor, ' on standard deviation');
    await user.click(screen.getByRole('button', { name: 'Note details' }));
    const info = screen.getByRole('dialog', { name: 'Details' });
    expect(within(info).getByText('Words').nextSibling).toHaveTextContent('4');
    expect(within(info).getByText('Reading time').nextSibling).toHaveTextContent('1 min');
    expect(within(info).getByText('Notes.md')).toBeInTheDocument();
  });

  it('keeps the bold color when switching layouts and reopening a note without saving edits', async () => {
    const { user } = await openNotes();
    await user.click(screen.getByRole('button', { name: 'Typography' }));
    const colors = screen.getByRole('radiogroup', { name: 'Bold text color' });
    await user.click(within(colors).getByRole('radio', { name: 'Blue' }));
    expect(screen.getByRole('region', { name: 'Edit Notes.md' })).toHaveAttribute(
      'data-bold-color',
      'blue',
    );
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await user.click(screen.getByRole('radio', { name: 'Notebook' }));
    expect(screen.getByRole('region', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit Notes.md' })).toHaveAttribute(
      'data-bold-color',
      'blue',
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Back to board' }));
    await user.dblClick(await screen.findByRole('button', { name: 'Select Notes.md' }));
    expect(await screen.findByRole('region', { name: 'Edit Notes.md' })).toHaveAttribute(
      'data-bold-color',
      'blue',
    );
    expect(saves()).toEqual([]);
  });

  it('toggles focus mode from the dock and with ⌘⇧F', async () => {
    const { user } = await openNotes();
    const workspace = screen.getByRole('region', { name: 'Edit Notes.md' });
    const focus = screen.getByRole('button', { name: 'Focus mode' });
    await user.click(focus);
    expect(focus).toHaveAttribute('aria-pressed', 'true');
    expect(workspace).toHaveClass('is-focus');
    await user.keyboard('{Meta>}{Shift>}f{/Shift}{/Meta}');
    expect(workspace).not.toHaveClass('is-focus');
  });

  it('toggles the Textmarker with ⌘⇧M without saving anything', async () => {
    const { user, editor } = await openNotes();
    await user.click(editor);
    await user.keyboard('{Meta>}{Shift>}m{/Shift}{/Meta}');
    expect(useNoteStyleStore.getState().markers).toBe(true);
    await user.keyboard('{Meta>}{Shift>}m{/Shift}{/Meta}');
    expect(useNoteStyleStore.getState().markers).toBe(false);
    expect(saves()).toEqual([]);
  });

  it('renames the note from the title on its page and reopens it there', async () => {
    const { user, editor } = await openNotes();
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(screen.getByRole('heading', { level: 1, name: 'Notes' })).toContainElement(title);
    await user.type(editor, ' first');
    await user.clear(title);
    await user.type(title, 'Lecture 3{Enter}');

    // Pending edits are written under the old name before the file moves.
    expect(saves()).toEqual([
      { action: 'save', path: 'Notes.md', content: '# Lecture first', expected: '# Lecture' },
    ]);
    expect(request).toHaveBeenCalledWith({
      action: 'move',
      path: 'Notes.md',
      destination: '',
      name: 'Lecture 3.md',
    });
    expect(await screen.findByRole('region', { name: 'Edit Lecture 3.md' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({ action: 'read', path: 'Lecture 3.md' });
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Lecture 3');
  });

  it('explains a title that cannot be a file name and keeps the old one', async () => {
    const { user } = await openNotes();
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Pros/Cons');
    await user.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('can’t contain “/”');
    expect(title).toHaveValue('Notes');
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'move' }));
  });

  it('keeps the title when Escape is pressed', async () => {
    const { user } = await openNotes();
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.type(title, ' draft{Escape}');
    expect(title).toHaveValue('Notes');
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'move' }));
  });

  it('saves with the keyboard shortcut without waiting for the pause', async () => {
    const { user, editor } = await openNotes();
    await user.type(editor, ' now');
    await user.keyboard('{Meta>}s{/Meta}');
    expect(saves()).toHaveLength(1);
  });

  it('keeps a note open and explains when its changes could not be saved', async () => {
    const { user, editor } = await openNotes();
    let full = true;
    answerSaves(() => {
      if (full) throw new Error('The disk is full.');
      return { status: 'saved' };
    });
    await user.type(editor, ' lost?');
    await user.click(screen.getByRole('button', { name: 'Back to board' }));
    expect(await screen.findByText(/Your latest changes are not saved yet/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Document content' })).toHaveValue(
      '# Lecture lost?',
    );
    full = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument(),
    );
  });

  it('pauses on a conflict and overwrites only when asked to keep this version', async () => {
    const { user, editor } = await openNotes();
    answerSaves((call) =>
      call.expected === '# Lecture'
        ? { status: 'conflict', disk: '# Edited in Obsidian' }
        : { status: 'saved' },
    );
    await user.type(editor, ' mine');
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'This note changed in another app' },
      { timeout: 3000 },
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Changed in another app');
    await user.click(within(dialog).getByRole('button', { name: 'Keep mine' }));
    await waitFor(() =>
      expect(saves().at(-1)).toEqual({
        action: 'save',
        path: 'Notes.md',
        content: '# Lecture mine',
        expected: '# Edited in Obsidian',
      }),
    );
    expect(await screen.findByText('Saved on your computer')).toBeInTheDocument();
  });

  it('can take the other app’s version after a conflict instead', async () => {
    const { user, editor } = await openNotes();
    answerSaves(() => ({ status: 'conflict', disk: '# Edited in Obsidian' }));
    await user.type(editor, ' mine');
    await user.keyboard('{Control>}s{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'This note changed in another app' });
    await user.click(within(dialog).getByRole('button', { name: 'Use the other version' }));
    expect(screen.getByRole('textbox', { name: 'Document content' })).toHaveValue(
      '# Edited in Obsidian',
    );
    expect(screen.getByText('Saved on your computer')).toBeInTheDocument();
  });

  it('finds notes by their text across all folders and opens a match', async () => {
    const user = userEvent.setup();
    const hit = {
      ...notes,
      name: 'Mitosis.md',
      path: 'Biology/Mitosis.md',
      snippet: 'Prophase comes first.',
      matches: 2,
      nameMatch: false,
    };
    const listing = request.getMockImplementation();
    request.mockImplementation((action) =>
      action.action === 'search' ? Promise.resolve([hit]) : listing!(action),
    );
    render(<DocumentExplorer />);
    await screen.findByRole('button', { name: 'Select Notes.md' });
    await user.click(screen.getByRole('button', { name: 'Search documents' }));
    await user.type(screen.getByRole('textbox', { name: 'Search this folder' }), 'prophase');
    const results = await screen.findByRole('region', { name: 'Search results in all folders' });
    const match = await within(results).findByRole('button', { name: /Mitosis\.md/ });
    expect(request).toHaveBeenCalledWith({ action: 'search', query: 'prophase' });
    expect(within(match).getByText('Prophase')).toHaveProperty('tagName', 'MARK');
    await user.click(match);
    expect(request).toHaveBeenCalledWith({ action: 'read', path: 'Biology/Mitosis.md' });
    expect(await screen.findByRole('heading', { name: 'Mitosis' })).toBeInTheDocument();
  });

  it('moves a document to a selected folder', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await user.click(await screen.findByRole('button', { name: 'Select Notes.md' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const dialog = screen.getByRole('dialog', { name: 'Move item' });
    await user.click(await within(dialog).findByRole('button', { name: 'Biology' }));
    await user.click(screen.getByRole('button', { name: 'Move here' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        action: 'move',
        path: 'Notes.md',
        destination: 'Biology',
        name: 'Notes.md',
      }),
    );
  });

  it('requires confirmation before moving a folder and its contents to recovery', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await user.click(screen.getByLabelText('Canvas options'));
    await user.click(screen.getByRole('button', { name: 'List view' }));
    await user.click(await screen.findByRole('button', { name: 'Select Biology' }));
    await user.click(screen.getByRole('button', { name: 'Move to Recently deleted' }));
    expect(request).not.toHaveBeenCalledWith({ action: 'trash', path: 'Biology' });
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Move to Recently deleted' }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'trash', path: 'Biology' }));
  });

  it('opens other formats in their system app and reveals selected items in the file manager', async () => {
    const user = userEvent.setup();
    request.mockResolvedValue({
      root: '/workspace',
      entries: [{ ...notes, name: 'Slides.pptx', path: 'Slides.pptx' }],
    });
    render(<DocumentExplorer />);
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Select Slides.pptx' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ action: 'open', path: 'Slides.pptx' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select Slides.pptx' }));
    await user.click(screen.getByRole('button', { name: 'Show in file manager' }));
    expect(request).toHaveBeenCalledWith({ action: 'reveal', path: 'Slides.pptx' });
  });

  it.each([
    ['Slides.pdf', 'application/pdf'],
    ['Diagram.PNG', 'image/png'],
    ['Photo.jpg', 'image/jpeg'],
  ])('previews %s inside a folder without opening an external app', async (name, mime) => {
    const user = userEvent.setup();
    request.mockImplementation((action) => {
      if (action.action === 'list')
        return Promise.resolve({
          root: '/workspace',
          entries: action.path ? [{ ...notes, name, path: `Biology/${name}` }] : [folder],
        });
      if (action.action === 'preview') return Promise.resolve({ mime, base64: 'YWJj' });
      return Promise.resolve();
    });
    render(<DocumentExplorer />);
    await user.click(await screen.findByRole('button', { name: 'Select Biology' }));
    await user.dblClick(await screen.findByRole('button', { name: `Select ${name}` }));
    const dialog = await screen.findByRole('dialog', { name });
    expect(request).toHaveBeenCalledWith({ action: 'preview', path: `Biology/${name}` });
    expect(request).not.toHaveBeenCalledWith({ action: 'open', path: `Biology/${name}` });
    if (mime === 'application/pdf')
      expect(await within(dialog).findByLabelText('PDF viewer')).toBeInTheDocument();
    else
      expect(await within(dialog).findByRole('img', { name })).toHaveAttribute(
        'src',
        `data:${mime};base64,YWJj`,
      );
    await user.click(within(dialog).getByRole('button', { name: 'Open in default app' }));
    expect(request).toHaveBeenCalledWith({ action: 'open', path: `Biology/${name}` });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps preview failures visible and offers the default app', async () => {
    const user = userEvent.setup();
    request.mockImplementation((action) => {
      if (action.action === 'list')
        return Promise.resolve({
          root: '/workspace',
          entries: [{ ...notes, name: 'Large.pdf', path: 'Large.pdf' }],
        });
      if (action.action === 'preview')
        return Promise.reject(new Error('Preview files up to 25 MB.'));
      if (action.action === 'open')
        return Promise.reject(new Error('The system could not open this item.'));
      return Promise.resolve();
    });
    render(<DocumentExplorer />);
    await user.dblClick(await screen.findByRole('button', { name: 'Select Large.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('25 MB');
    await user.click(screen.getByRole('button', { name: 'Open in default app' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('system could not open');
  });
});

describe('Document canvas', () => {
  it('offers student file actions for a selected image', async () => {
    const image = { ...notes, name: 'Scan.png', path: 'Scan.png' };
    request.mockImplementation((action) => {
      if (action.action === 'list')
        return Promise.resolve({ root: '/workspace', entries: [image] });
      if (action.action === 'preview')
        return Promise.resolve({
          mime: 'image/png',
          base64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
        });
      return Promise.resolve();
    });
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await user.click(await screen.findByRole('button', { name: 'Select Scan.png' }));
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect(screen.getByRole('menuitem', { name: /Make submission PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Make upload smaller' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Extract pages' })).not.toBeInTheDocument();
  });

  it('starts with a quiet canvas and reveals creation controls only on demand', async () => {
    const user = userEvent.setup();
    render(<DocumentExplorer />);
    await screen.findByRole('button', { name: 'Select Notes.md' });
    expect(screen.getByLabelText('Document canvas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search this folder' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(screen.getByRole('button', { name: 'New document' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'New document' })).not.toBeInTheDocument();
  });

  it('persists keyboard positioning and pins across reopening', async () => {
    const user = userEvent.setup();
    const first = render(<DocumentExplorer />);
    const card = await screen.findByRole('button', { name: 'Select Notes.md' });
    await user.click(card);
    const before = parseFloat(card.style.left);
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(parseFloat(card.style.left)).toBe(before + 16);
    await user.click(screen.getByRole('button', { name: 'Pin for studying' }));
    first.unmount();
    render(<DocumentExplorer />);
    const reopened = await screen.findByRole('button', { name: 'Select Notes.md' });
    expect(parseFloat(reopened.style.left)).toBe(before + 16);
    await user.click(screen.getByLabelText('Canvas options'));
    await user.click(screen.getByRole('button', { name: 'Show pinned only' }));
    expect(screen.getByRole('button', { name: 'Select Notes.md' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Biology' })).not.toBeInTheDocument();
  });

  it('focuses a folder while keeping its background noninteractive', async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentExplorer />);
    await user.dblClick(await screen.findByRole('button', { name: 'Select Biology' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'list', path: 'Biology' }));
    expect(container.querySelector('.canvas-background')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Select Notes.md' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to parent folder' }));
    expect(await screen.findByRole('button', { name: 'Select Notes.md' })).toBeInTheDocument();
  });

  it('keeps the camera and zoom while laying folder contents above its saved position', async () => {
    const baseRequest = request.getMockImplementation()!;
    request.mockImplementation((action) =>
      action.action === 'list' && action.path === 'Biology'
        ? Promise.resolve({
            root: '/Users/student/Documents/Uni Pilot',
            entries: [{ ...notes, path: 'Biology/Notes.md' }],
          })
        : baseRequest(action),
    );
    localStorage.setItem(
      'uni-pilot:document-canvas:v1',
      JSON.stringify({ Biology: { x: 600, y: 325 } }),
    );
    const user = userEvent.setup();
    const { container } = render(<DocumentExplorer />);
    const folderCard = await screen.findByRole('button', { name: 'Select Biology' });
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.wheel(container.querySelector('.canvas-viewport')!, { deltaX: 75, deltaY: 125 });
    const zoom = Number(
      container
        .querySelector<HTMLElement>('.canvas-stage')!
        .style.transform.match(/scale\((.*?)\)/)?.[1],
    );
    expect(zoom).toBeGreaterThan(0);
    const camera = container.querySelector<HTMLElement>('.canvas-world')!.style.transform;
    expect(camera).not.toBe('translate(0px, 0px)');

    await user.click(folderCard);
    const opened = await screen.findByRole('button', { name: 'Close Biology folder' });
    const child = await screen.findByRole('button', { name: 'Select Notes.md' });
    expect(parseFloat(opened.style.left)).toBe(600 * zoom);
    expect(parseFloat(opened.style.top)).toBe(325 * zoom);
    expect(opened.style.transform).toBe(`scale(${zoom})`);
    expect(parseFloat(child.style.left)).toBeGreaterThan(600);
    expect(parseFloat(child.style.left)).toBeLessThan(600 + 176);
    expect(parseFloat(child.style.top)).toBeLessThan(325);
    expect(container.querySelector<HTMLElement>('.canvas-world')!.style.transform).toBe(camera);

    await user.click(opened);
    const restored = await screen.findByRole('button', { name: 'Select Biology' });
    expect(restored.style.left).toBe('600px');
    expect(restored.style.top).toBe('325px');
    expect(container.querySelector<HTMLElement>('.canvas-world')!.style.transform).toBe(camera);
  });

  it('keeps the immediate parent context when opening and closing nested folders', async () => {
    const user = userEvent.setup();
    const nested = { ...folder, name: 'Lectures', path: 'Biology/Lectures' };
    const sibling = { ...notes, path: 'Biology/Notes.md' };
    request.mockImplementation((action) => {
      if (action.action === 'list')
        return Promise.resolve({
          root: '/workspace',
          entries: action.path === 'Biology' ? [nested, sibling] : action.path ? [] : [folder],
        });
      if (action.action === 'read') return Promise.resolve('# Lecture');
      return Promise.resolve();
    });
    const { container } = render(<DocumentExplorer />);
    await user.click(await screen.findByRole('button', { name: 'Select Biology' }));
    const nestedCard = await screen.findByRole('button', { name: 'Select Lectures' });
    const siblingCard = screen.getByRole('button', { name: 'Select Notes.md' });
    const siblingPosition = {
      x: parseFloat(siblingCard.style.left),
      y: parseFloat(siblingCard.style.top),
    };
    const nestedPosition = {
      x: parseFloat(nestedCard.style.left),
      y: parseFloat(nestedCard.style.top),
    };
    const zoom = Number(
      container
        .querySelector<HTMLElement>('.canvas-stage')!
        .style.transform.match(/scale\((.*?)\)/)?.[1],
    );
    await user.click(nestedCard);
    const openedNested = await screen.findByRole('button', { name: 'Close Lectures folder' });
    expect(parseFloat(openedNested.style.left)).toBe(nestedPosition.x * zoom);
    expect(parseFloat(openedNested.style.top)).toBe(nestedPosition.y * zoom);
    expect(container.querySelector('.canvas-background')).toHaveTextContent('Notes.md');
    const siblingBackground = Array.from(
      container.querySelectorAll<HTMLElement>('.canvas-background .canvas-card'),
    ).find((card) => card.textContent?.includes('Notes.md'))!;
    expect(parseFloat(siblingBackground.style.left)).toBe(siblingPosition.x * zoom);
    expect(parseFloat(siblingBackground.style.top)).toBe(siblingPosition.y * zoom);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Go to parent folder' })).toBeEnabled(),
    );
    await user.keyboard('{Escape}');
    await screen.findByRole('button', { name: 'Select Lectures' });
    await user.click(screen.getByRole('button', { name: 'Close Biology folder' }));
    expect(await screen.findByRole('button', { name: 'Select Biology' })).toBeInTheDocument();
  });

  it('highlights folder targets and moves the actual document on drop', async () => {
    // jsdom does not supply a PointerEvent constructor with coordinates.
    vi.stubGlobal('PointerEvent', MouseEvent);
    try {
      render(<DocumentExplorer />);
      const card = await screen.findByRole('button', { name: 'Select Notes.md' });
      const target = screen.getByRole('button', { name: 'Select Biology' });
      await waitFor(() =>
        expect(localStorage.getItem('uni-pilot:document-canvas:v1')).toContain('Notes.md'),
      );
      const dx = (parseFloat(target.style.left) - parseFloat(card.style.left)) * 0.85;
      const dy = (parseFloat(target.style.top) - parseFloat(card.style.top)) * 0.85;
      fireEvent.pointerDown(card, { button: 0, clientX: 300, clientY: 200 });
      fireEvent.pointerMove(card, { clientX: 300 + dx, clientY: 200 + dy });
      expect(target).toHaveClass('is-drop-target');
      fireEvent.pointerUp(card, { clientX: 300 + dx, clientY: 200 + dy });
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith({
          action: 'move',
          path: 'Notes.md',
          destination: 'Biology',
          name: 'Notes.md',
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows note content in a readable quick preview on hover', async () => {
    request.mockImplementation((action) => {
      if (action.action === 'list')
        return Promise.resolve({ root: '/Users/student/Documents/Uni Pilot', entries: [notes] });
      if (action.action === 'read')
        return Promise.resolve('# Lecture\n\n- Key concept with **emphasis**');
      return Promise.resolve();
    });
    render(<DocumentExplorer />);
    const card = await screen.findByRole('button', { name: 'Select Notes.md' });
    fireEvent.pointerEnter(card);
    const preview = await screen.findByLabelText('Preview of Notes.md');
    await waitFor(() => expect(preview).toHaveTextContent('Lecture'));
    expect(preview).toHaveTextContent('Key concept with emphasis');
    expect(preview).not.toHaveTextContent('**');
    fireEvent.click(card);
    fireEvent.pointerLeave(card);
    expect(screen.getByLabelText('Preview of Notes.md')).toBeInTheDocument();
  });

  it('restores a dragged card and reports failed moves', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    try {
      render(<DocumentExplorer />);
      const card = await screen.findByRole('button', { name: 'Select Notes.md' });
      const target = screen.getByRole('button', { name: 'Select Biology' });
      await waitFor(() =>
        expect(localStorage.getItem('uni-pilot:document-canvas:v1')).toContain('Notes.md'),
      );
      const left = card.style.left;
      const top = card.style.top;
      const dx = (parseFloat(target.style.left) - parseFloat(left)) * 0.85;
      const dy = (parseFloat(target.style.top) - parseFloat(top)) * 0.85;
      request.mockRejectedValueOnce('The destination already contains this file.');
      fireEvent.pointerDown(card, { button: 0, clientX: 300, clientY: 200 });
      fireEvent.pointerMove(card, { clientX: 300 + dx, clientY: 200 + dy });
      fireEvent.pointerUp(card);
      expect(await screen.findByRole('alert')).toHaveTextContent('already contains');
      expect(card.style.left).toBe(left);
      expect(card.style.top).toBe(top);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it('imports files dropped onto the canvas into the current folder', async () => {
  render(<DocumentExplorer />);
  await screen.findByRole('button', { name: 'Select Notes.md' });
  const file = new File(['abc'], 'Reading.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(new Uint8Array([97, 98, 99]).buffer),
  });
  fireEvent.drop(screen.getByLabelText('Canvas workspace'), { dataTransfer: { files: [file] } });
  await waitFor(() =>
    expect(upload).toHaveBeenCalledWith(
      { kind: 'import', path: '', name: 'Reading.txt' },
      new Uint8Array([97, 98, 99]),
    ),
  );
  expect(await screen.findByText(/1 file imported/)).toBeInTheDocument();
});
