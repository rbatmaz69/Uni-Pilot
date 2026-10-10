import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  documentRequest,
  type DocumentEntry,
  type DocumentRequest,
} from '@/features/documents/lib/files';
import { clearPreviewCache } from '@/features/documents/lib/previewCache';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
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
const second: DocumentEntry = { ...notes, name: 'Second.md', path: 'Second.md' };
const biology: DocumentEntry = {
  name: 'Biology',
  path: 'Biology',
  folder: true,
  size: 0,
  modified: 1000,
};
const saves = () =>
  request.mock.calls
    .map(([call]) => call)
    .filter((call): call is Extract<DocumentRequest, { action: 'save' }> => call.action === 'save');

const titleBar = () => screen.getByRole('banner', { name: 'Title bar' });
const tabs = () => within(titleBar()).getAllByRole('tab');
const openTab = () => within(titleBar()).getByRole('tab', { selected: true });
const back = () => within(titleBar()).getByRole('button', { name: 'Go back' });
const forward = () => within(titleBar()).getByRole('button', { name: 'Go forward' });
const tree = () => screen.getByLabelText('Document spaces');
const editor = () => screen.findByRole('textbox', { name: 'Document content' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearPreviewCache();
  vi.mocked(isDesktopRuntime).mockReturnValue(true);
  request.mockImplementation((action) => {
    if (action.action === 'list')
      return Promise.resolve({
        root: '/Users/student/Documents/Uni Pilot',
        entries: action.path ? [] : [notes, second, biology],
      });
    if (action.action === 'read') return Promise.resolve('# Lecture');
    if (action.action === 'save') return Promise.resolve({ status: 'saved' });
    return Promise.resolve();
  });
});

describe('Documents in the app’s tabs', () => {
  it('has no tab row of its own: its places show in the title bar’s open tab', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    expect(screen.getAllByRole('tablist', { name: 'Tabs' })).toHaveLength(1);
    expect(openTab()).toHaveAccessibleName('Documents');

    await user.click(await within(tree()).findByRole('button', { name: 'Biology' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));
    await user.click(within(tree()).getByRole('button', { name: 'Notes' }));
    await editor();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
    // As in a browser: a click opens in the tab it was made in.
    expect(tabs()).toHaveLength(1);
  });

  it('opens a note in a new tab on ⌘-click, and the open tab stays where it was', async () => {
    renderApp(NAV_ITEMS.documents.path);
    await within(tree()).findByRole('button', { name: 'Notes' });

    fireEvent.click(within(tree()).getByRole('button', { name: 'Notes' }), { metaKey: true });

    await waitFor(() => expect(tabs()).toHaveLength(2));
    expect(await editor()).toBeInTheDocument();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
    expect(tabs()[0]).toHaveAccessibleName('Documents');
  });

  it('saves the open note when another tab is opened, and finds it again in its tab', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    await user.type(await editor(), ' draft');

    await user.click(within(titleBar()).getByRole('button', { name: 'New tab' }));
    await waitFor(() => expect(saves().at(-1)).toMatchObject({ content: '# Lecture draft' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Documents'));
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument();
    expect(tabs()).toHaveLength(2);

    await user.click(within(titleBar()).getByRole('tab', { name: 'Notes' }));
    expect(await editor()).toBeInTheDocument();
    expect(openTab()).toHaveAccessibleName('Notes');
  });

  it('goes back and forward between a folder and a note, saving the note on the way out', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    expect(back()).toBeDisabled();
    expect(forward()).toBeDisabled();

    await user.click(await within(tree()).findByRole('button', { name: 'Biology' }));
    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    await user.type(await editor(), ' draft');
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
    expect(back()).toBeEnabled();
    expect(forward()).toBeDisabled();

    await user.click(back());
    await waitFor(() => expect(saves().at(-1)).toMatchObject({ content: '# Lecture draft' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument();
    expect(forward()).toBeEnabled();

    await user.click(forward());
    expect(await editor()).toBeInTheDocument();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
    expect(forward()).toBeDisabled();

    // Back once more leaves the note, and once more reaches where it all began.
    await user.click(back());
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));
    await user.click(back());
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Documents'));
    expect(back()).toBeDisabled();
    expect(forward()).toBeEnabled();
  });

  it('goes from one note straight back to the note before it, not the folder between', async () => {
    const base = request.getMockImplementation()!;
    request.mockImplementation((action) =>
      // Reading takes a moment on a real disk; the folder shows meanwhile.
      action.action === 'read' && action.path === 'Second.md'
        ? new Promise((resolve) => setTimeout(() => resolve('# Second'), 40))
        : base(action),
    );
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    await editor();
    await user.click(within(tree()).getByRole('button', { name: 'Second' }));
    // The slow read takes its time; under a full test run, more than usual.
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Second'), { timeout: 3000 });

    await user.click(back());
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'), { timeout: 3000 });
    expect(
      await screen.findByRole('textbox', { name: 'Document content' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('forgets what lay ahead once the student goes somewhere new', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    await user.click(await within(tree()).findByRole('button', { name: 'Biology' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));
    await user.click(back());
    await waitFor(() => expect(forward()).toBeEnabled());

    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    await editor();
    await waitFor(() => expect(forward()).toBeDisabled());
  });

  it('goes back and forward with ⌘[ and ⌘], but not while typing in a note', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    await user.click(await within(tree()).findByRole('button', { name: 'Biology' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));

    // Ctrl stands in for ⌘ where the platform is not a Mac, as in the test browser.
    fireEvent.keyDown(document.body, { key: '[', ctrlKey: true });
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Documents'));
    fireEvent.keyDown(document.body, { key: ']', ctrlKey: true });
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Biology'));

    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    const field = await editor();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
    fireEvent.keyDown(field, { key: '[', ctrlKey: true });
    expect(openTab()).toHaveAccessibleName('Notes');
    expect(screen.getByRole('textbox', { name: 'Document content' })).toBeInTheDocument();
  });

  it('comes back to the note from another section', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    await user.click(await within(tree()).findByRole('button', { name: 'Notes' }));
    await editor();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));

    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    await user.click(within(rail).getByRole('link', { name: 'Calendar' }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Calendar'));

    await user.click(back());
    expect(await editor()).toBeInTheDocument();
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Notes'));
  });

  it('hides and shows the documents sidebar from the title bar', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    expect(tree()).toBeInTheDocument();

    await user.click(within(titleBar()).getByRole('button', { name: 'Hide sidebar' }));
    expect(screen.queryByLabelText('Document spaces')).not.toBeInTheDocument();
    // One preference for every section's sidebar, not a Documents setting.
    expect(useUiStore.getState().panelOpen).toBe(false);
    // The tabs and the page itself stay.
    expect(openTab()).toHaveAccessibleName('Documents');
    expect(await screen.findByRole('button', { name: 'Select Notes.md' })).toBeInTheDocument();

    await user.click(within(titleBar()).getByRole('button', { name: 'Show sidebar' }));
    expect(tree()).toBeInTheDocument();
    expect(useUiStore.getState().panelOpen).toBe(true);
  });
});
