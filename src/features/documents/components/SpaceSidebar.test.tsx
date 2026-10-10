import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaceSidebar } from '@/features/documents/components/SpaceSidebar';
import {
  documentRequest,
  type DocumentEntry,
  type IliasCourse,
} from '@/features/documents/lib/files';
import { useDocumentsLayoutStore } from '@/features/documents/store/documentsLayoutStore';
import { useSpaceStore } from '@/features/documents/store/spaceStore';
import { defaultFolderAppearance, useFolderAppearanceStore } from '../store/folderAppearanceStore';
import { writeDocumentDrag } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import { createDataTransfer } from '@/test/dataTransfer';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));
const request = vi.mocked(documentRequest);

const entry = (path: string, folder: boolean, extra: Partial<DocumentEntry> = {}) => ({
  name: path.split('/').at(-1) ?? path,
  path,
  folder,
  size: 0,
  modified: 0,
  ...extra,
});

const winter = 'Courses/Winter 2026-27';
const workspace: Record<string, DocumentEntry[]> = {
  '': [entry('Courses', true, { unseen: 4 }), entry('Personal', true), entry('Inbox.md', false)],
  Courses: [
    entry(winter, true, { unseen: 3 }),
    entry('Courses/Plan.md', false, { modified: 2 }),
    entry('Courses/Blatt 1.pdf', false, { modified: 1, unseen: 1 }),
  ],
  [winter]: [
    entry(`${winter}/Datenbanken`, true, { unseen: 2 }),
    entry(`${winter}/Analysis`, true, { unseen: 1 }),
    entry(`${winter}/Mathe`, true),
  ],
  [`${winter}/Datenbanken`]: [
    entry(`${winter}/Datenbanken/Skript`, true),
    entry(`${winter}/Datenbanken/Folien.md`, false),
  ],
  [`${winter}/Datenbanken/Skript`]: [entry(`${winter}/Datenbanken/Skript/Kapitel 1.md`, false)],
  [`${winter}/Analysis`]: [],
  Personal: [
    entry('Personal/Routines', true),
    entry('Personal/Sunday reset.md', false, { modified: 1 }),
    entry('Personal/Morning pages.md', false, { modified: 5 }),
  ],
  'Personal/Routines': [entry('Personal/Routines/Lauf.md', false)],
};

const datenbanken = `${winter}/Datenbanken/ILIAS`;
const courses: IliasCourse[] = [
  {
    courseRefId: '7',
    title: 'Datenbanken 1 - WS26',
    root: datenbanken,
    syncedAt: null,
    unseen: 2,
    files: [],
  },
  {
    courseRefId: '8',
    title: 'Analysis',
    root: `${winter}/Analysis/ILIAS`,
    syncedAt: null,
    unseen: 0,
    files: [],
  },
];
const personal = { id: 'personal', name: 'Personal', folder: 'Personal' };
const uni = { id: 'uni', name: 'Uni', folder: 'Courses' };

beforeEach(() => {
  vi.clearAllMocks();
  useSpaceStore.setState({ spaces: [], picked: null });
  useFolderAppearanceStore.setState({ appearances: {} });
  request.mockImplementation((call) =>
    call.action === 'list' && call.path in workspace
      ? Promise.resolve({ root: '/workspace', entries: workspace[call.path] })
      : call.action === 'list'
        ? Promise.reject(new Error('No such folder.'))
        : Promise.resolve(null),
  );
});

function renderSidebar(props: Partial<ComponentProps<typeof SpaceSidebar>> = {}) {
  const handlers = {
    onFolder: vi.fn(),
    onFile: vi.fn(),
    onNewNote: vi.fn(),
    onNewFolder: vi.fn(),
    onNewSpace: vi.fn(),
    onEditSpace: vi.fn(),
    onIlias: vi.fn(),
  };
  const utils = render(
    <SpaceSidebar
      desktop
      activePath=""
      activeFile={null}
      revision={0}
      iliasCourses={courses}
      {...handlers}
      {...props}
    />,
  );
  return {
    user: userEvent.setup(),
    sidebar: screen.getByLabelText('Document spaces'),
    ...handlers,
    ...utils,
  };
}

/** The sidebar as the explorer drives it: opening a folder opens it. */
function Explorer({ start = '' }: { start?: string }) {
  const [path, setPath] = useState(start);
  return (
    <SpaceSidebar
      desktop
      activePath={path}
      activeFile={null}
      revision={0}
      iliasCourses={courses}
      onFolder={setPath}
      onFile={vi.fn()}
      onNewNote={vi.fn()}
      onNewFolder={vi.fn()}
      onNewSpace={vi.fn()}
      onEditSpace={vi.fn()}
      onIlias={setPath}
    />
  );
}

/** The name of the open space: the button in the sidebar's heading. */
const switcher = (sidebar: HTMLElement) =>
  within(within(sidebar).getByRole('heading', { level: 2 })).getByRole('button');

async function openMenu(user: UserEvent, sidebar: HTMLElement) {
  await user.click(switcher(sidebar));
  return within(sidebar).getByRole('menu', { name: 'Spaces' });
}

describe('Space switcher', () => {
  it('lists Documents, ILIAS and the added spaces, with how many files are new', async () => {
    useSpaceStore.setState({ spaces: [personal, uni], picked: null });
    const { user, sidebar } = renderSidebar();
    const button = switcher(sidebar);
    expect(button).toHaveAccessibleName('Documents');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar).queryByRole('menu')).not.toBeInTheDocument();

    const menu = await openMenu(user, sidebar);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(
      await within(menu).findByRole('menuitemradio', { name: 'Uni space, 4 new' }),
    ).toBeVisible();
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Documents', 'ILIAS, 2 new', 'Personal space', 'Uni space, 4 new']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Documents' })).toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: 'ILIAS, 2 new' })).not.toBeChecked();
    expect(within(menu).getByRole('menuitem', { name: 'New space…' })).toBeVisible();
    // Documents and ILIAS are not the student's to edit or remove.
    expect(within(menu).queryByRole('menuitem', { name: 'Edit space…' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^Remove from sidebar/ })).toBeNull();
  });

  it('goes to a space, marks it as the open one and closes', async () => {
    useSpaceStore.setState({ spaces: [personal] });
    const user = userEvent.setup();
    render(<Explorer />);
    const sidebar = screen.getByLabelText('Document spaces');
    await within(sidebar).findByRole('button', { name: 'Personal' });

    const menu = await openMenu(user, sidebar);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Personal space' }));
    expect(within(sidebar).queryByRole('menu')).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('heading', { name: 'Personal' })).toBeVisible();
    expect(switcher(sidebar)).toHaveFocus();
    expect(sidebar).toHaveAttribute('data-tone');

    await openMenu(user, sidebar);
    expect(screen.getByRole('menuitemradio', { name: 'Personal space' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Documents' }));
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(sidebar).not.toHaveAttribute('data-tone');
  });

  it('opens from the keyboard, moves with the arrows and returns to the button on Escape', async () => {
    useSpaceStore.setState({ spaces: [personal] });
    const { user, sidebar } = renderSidebar();
    switcher(sidebar).focus();

    await user.keyboard('{ArrowDown}');
    const menu = within(sidebar).getByRole('menu', { name: 'Spaces' });
    // The open space is where the keyboard starts.
    expect(within(menu).getByRole('menuitemradio', { name: 'Documents' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'ILIAS, 2 new' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(within(menu).getByRole('menuitem', { name: 'New space…' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Documents' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(within(menu).getByRole('menuitem', { name: 'New space…' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(within(sidebar).queryByRole('menu')).not.toBeInTheDocument();
    expect(switcher(sidebar)).toHaveFocus();
  });

  it('closes when the pointer goes down anywhere else', async () => {
    const { user, sidebar } = renderSidebar();
    await openMenu(user, sidebar);
    await user.click(document.body);
    expect(within(sidebar).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('adds a space from the menu', async () => {
    const { user, sidebar, onNewSpace } = renderSidebar();
    const menu = await openMenu(user, sidebar);
    await user.click(within(menu).getByRole('menuitem', { name: 'New space…' }));
    expect(onNewSpace).toHaveBeenCalled();
    expect(within(sidebar).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('edits or removes an added space, keeping its folder', async () => {
    useSpaceStore.setState({ spaces: [personal], picked: 'personal' });
    const { user, sidebar, onEditSpace } = renderSidebar({ activePath: 'Personal' });
    let menu = await openMenu(user, sidebar);
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit space…' }));
    expect(onEditSpace).toHaveBeenCalledWith(personal);

    menu = await openMenu(user, sidebar);
    const remove = within(menu).getByRole('menuitem', { name: /^Remove from sidebar/ });
    expect(remove).toHaveAccessibleName(/The folder and its files stay/);
    await user.click(remove);
    expect(useSpaceStore.getState().spaces).toEqual([]);
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    menu = await openMenu(user, sidebar);
    expect(
      within(menu).queryByRole('menuitemradio', { name: 'Personal space' }),
    ).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'trash' }));
  });

  it('takes a course dropped anywhere on the sidebar into Documents', () => {
    const onAddCourse = vi.fn();
    const { sidebar } = renderSidebar({ activePath: ':ilias', onAddCourse });
    const target = switcher(sidebar);
    const carried = new Map([['application/x-uni-pilot-course', '100100']]);
    const dataTransfer = {
      types: [...carried.keys()],
      getData: (type: string) => carried.get(type) ?? '',
      dropEffect: 'none',
    };
    expect(sidebar).not.toHaveClass('is-drop-target');
    fireEvent.dragOver(target, { dataTransfer });
    expect(sidebar).toHaveClass('is-drop-target');
    expect(screen.getByRole('status')).toHaveTextContent('Drop to add the course to Documents');
    fireEvent.drop(target, { dataTransfer });
    expect(onAddCourse).toHaveBeenCalledWith('100100');
    expect(sidebar).not.toHaveClass('is-drop-target');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a drag that carries no course', () => {
    const onAddCourse = vi.fn();
    const { sidebar } = renderSidebar({ onAddCourse });
    const dataTransfer = createDataTransfer();
    fireEvent.dragOver(sidebar, { dataTransfer });
    expect(sidebar).not.toHaveClass('is-drop-target');
    fireEvent.drop(sidebar, { dataTransfer });
    expect(onAddCourse).not.toHaveBeenCalled();
  });
});

describe('Space sidebar', () => {
  it('shows the whole workspace in Documents, folders open and notes loose', async () => {
    const { sidebar } = renderSidebar();
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(sidebar).not.toHaveAttribute('data-tone');
    const routines = await within(sidebar).findByRole('group', { name: 'Personal' });
    expect(await within(routines).findByRole('button', { name: 'Routines' })).toBeVisible();
    expect(within(sidebar).getByRole('button', { name: 'Inbox' })).toBeVisible();
    // Folders first, then the notes.
    const names = within(sidebar)
      .getAllByRole('button', { name: /^(Courses|Personal|Inbox)\b/ })
      .map((button) => button.textContent?.trim());
    expect(names.indexOf('Inbox')).toBeGreaterThan(
      names.findIndex((n) => n?.startsWith('Personal')),
    );
  });

  it('stays in the space it started in when a folder that is a space opens', async () => {
    useSpaceStore.setState({ spaces: [personal] });
    const user = userEvent.setup();
    render(<Explorer />);
    const sidebar = screen.getByLabelText('Document spaces');
    await user.click(await within(sidebar).findByRole('button', { name: 'Personal' }));
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
  });

  it('shows an added space with its own hue, and its notes latest first', async () => {
    useSpaceStore.setState({ spaces: [personal, uni], picked: 'personal' });
    const { user, sidebar, onFile } = renderSidebar({ activePath: 'Personal' });
    expect(within(sidebar).getByRole('heading', { name: 'Personal' })).toBeVisible();
    expect(sidebar).toHaveAttribute('data-tone');

    const notes = (
      await within(sidebar).findAllByRole('button', { name: /^(Morning pages|Sunday reset)$/ })
    ).map((button) => button.textContent);
    expect(notes).toEqual(['Morning pages', 'Sunday reset']);
    await user.click(within(sidebar).getByRole('button', { name: 'Sunday reset' }));
    expect(onFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Personal/Sunday reset.md' }),
    );
    await user.click(within(sidebar).getByRole('button', { name: 'Collapse Routines' }));
    expect(within(sidebar).queryByRole('group', { name: 'Routines' })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: 'Expand Routines' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('gives notes a document icon and other files a plain one', async () => {
    const { sidebar } = renderSidebar({ activePath: 'Courses' });
    const group = await within(sidebar).findByRole('group', { name: 'Courses' });
    await within(group).findByRole('button', { name: 'Plan' });
    const icon = (name: string) =>
      within(group).getByRole('button', { name }).querySelector('svg')!.getAttribute('class') ?? '';
    expect(icon('Plan')).toContain('lucide-file-text');
    expect(icon('Blatt 1.pdf New')).toContain('lucide-file');
    expect(icon('Blatt 1.pdf New')).not.toContain('lucide-file-text');
  });

  it('shows no number but how many files are new, and a dot on a new file', async () => {
    useSpaceStore.setState({ spaces: [uni], picked: 'uni' });
    const { user, sidebar } = renderSidebar({ activePath: `${winter}/Datenbanken` });
    const menu = await openMenu(user, sidebar);
    expect(
      await within(menu).findByRole('menuitemradio', { name: 'Uni space, 4 new' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    const semester = await within(sidebar).findByRole('group', { name: 'Winter 2026-27' });
    const databases = await within(semester).findByRole('button', {
      name: 'Datenbanken 2 new files',
    });
    expect(databases).toHaveAttribute('aria-current', 'page');
    expect(within(semester).getByRole('button', { name: 'Analysis 1 new file' })).toBeVisible();
    expect(
      within(within(semester).getByRole('button', { name: 'Mathe' })).queryByRole('img'),
    ).toBeNull();
    expect(within(sidebar).getByRole('button', { name: 'Blatt 1.pdf New' })).toBeVisible();

    // Every number on screen is a new-files badge: no document counts.
    for (const number of within(sidebar).getAllByText(/\d/)) {
      if (number.textContent === 'Winter 2026-27' || number.textContent === 'Blatt 1.pdf') continue;
      expect(number).toHaveAttribute('role', 'img');
      expect(number).toHaveAccessibleName(/new files?$/);
    }
  });

  it('opens the space overview from the header, and marks it while it shows', async () => {
    useSpaceStore.setState({ spaces: [personal], picked: 'personal' });
    const { user, sidebar, onFolder, rerender, ...handlers } = renderSidebar({
      activePath: 'Personal/Routines',
    });
    const overview = within(sidebar).getByRole('button', { name: 'Space overview' });
    expect(overview).not.toHaveAttribute('aria-current');
    await user.click(overview);
    expect(onFolder).toHaveBeenCalledWith('Personal');

    rerender(
      <SpaceSidebar
        desktop
        activePath="Personal"
        activeFile={null}
        revision={0}
        iliasCourses={courses}
        onFolder={onFolder}
        {...handlers}
      />,
    );
    expect(within(sidebar).getByRole('button', { name: 'Space overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('starts a note or a folder in the folder of the open space', async () => {
    useSpaceStore.setState({ spaces: [personal], picked: 'personal' });
    const { user, sidebar, onNewNote, onNewFolder } = renderSidebar({
      activePath: 'Personal/Routines',
    });
    await user.click(within(sidebar).getByRole('button', { name: 'New note' }));
    expect(onNewNote).toHaveBeenCalledWith('Personal');
    await user.click(within(sidebar).getByRole('button', { name: 'New folder' }));
    expect(onNewFolder).toHaveBeenCalledWith('Personal');
  });

  it('starts them in the whole workspace from Documents, and not off the desktop', async () => {
    const { user, sidebar, onNewNote, onNewFolder, unmount } = renderSidebar();
    await user.click(within(sidebar).getByRole('button', { name: 'New note' }));
    await user.click(within(sidebar).getByRole('button', { name: 'New folder' }));
    expect(onNewNote).toHaveBeenCalledWith('');
    expect(onNewFolder).toHaveBeenCalledWith('');
    unmount();

    renderSidebar({ desktop: false });
    expect(screen.getByRole('button', { name: 'New note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New folder' })).toBeDisabled();
  });

  it('says so when the folder of a space is gone', async () => {
    useSpaceStore.setState({ spaces: [{ ...personal, folder: 'Gone' }], picked: 'personal' });
    const { user, sidebar, onEditSpace } = renderSidebar({ activePath: 'Gone' });
    expect(await within(sidebar).findByRole('alert')).toHaveTextContent('folder is missing');
    await user.click(within(sidebar).getByRole('button', { name: 'Choose another folder' }));
    expect(onEditSpace).toHaveBeenCalled();
  });

  it('gathers the synced courses in the ILIAS space, with how many files are new', async () => {
    const { user, sidebar, onIlias } = renderSidebar({ activePath: ':ilias' });
    expect(within(sidebar).getByRole('heading', { name: 'ILIAS' })).toBeVisible();
    const menu = await openMenu(user, sidebar);
    expect(within(menu).getByRole('menuitemradio', { name: 'ILIAS, 2 new' })).toBeChecked();
    await user.keyboard('{Escape}');
    expect(within(sidebar).getByRole('button', { name: 'Analysis' })).toBeVisible();
    await user.click(
      within(sidebar).getByRole('button', { name: 'Datenbanken 1 - WS26 2 new files' }),
    );
    expect(onIlias).toHaveBeenCalledWith(datenbanken);
    expect(within(sidebar).queryByRole('button', { name: 'New note' })).not.toBeInTheDocument();
    // Nothing to search, collapse or add a folder to: the courses are ILIAS's.
    for (const name of ['Search all documents', 'Collapse all folders', 'New folder'])
      expect(within(sidebar).queryByRole('button', { name })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: 'Space overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(request).not.toHaveBeenCalledWith({ action: 'list', path: ':ilias' });
  });

  it('opens a synced course folder in the ILIAS space when no space was picked', async () => {
    const { user, sidebar, onIlias } = renderSidebar({ activePath: `${datenbanken}/Folien` });
    expect(within(sidebar).getByRole('heading', { name: 'ILIAS' })).toBeVisible();
    expect(
      within(sidebar).getByRole('button', { name: 'Datenbanken 1 - WS26 2 new files' }),
    ).toHaveAttribute('aria-current', 'page');
    await user.click(within(sidebar).getByRole('button', { name: 'Space overview' }));
    expect(onIlias).toHaveBeenCalledWith(':ilias');
  });

  it('opens a course in the ILIAS space', () => {
    const onIliasCourse = vi.fn();
    const { sidebar } = renderSidebar({ activePath: ':ilias', onIliasCourse });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Analysis' }));
    expect(onIliasCourse).toHaveBeenCalledWith('8');
  });

  it('lists a space again when the workspace changed', async () => {
    useSpaceStore.setState({ spaces: [uni] });
    const props = {
      desktop: true,
      activePath: '',
      activeFile: null,
      iliasCourses: [],
      onFolder: vi.fn(),
      onFile: vi.fn(),
      onNewNote: vi.fn(),
      onNewFolder: vi.fn(),
      onNewSpace: vi.fn(),
      onEditSpace: vi.fn(),
      onIlias: vi.fn(),
    };
    const user = userEvent.setup();
    const { rerender } = render(<SpaceSidebar {...props} revision={0} />);
    await openMenu(user, screen.getByLabelText('Document spaces'));
    await screen.findByRole('menuitemradio', { name: 'Uni space, 4 new' });
    request.mockImplementation((call) =>
      Promise.resolve(
        call.action === 'list'
          ? { root: '/workspace', entries: [entry('Courses/Plan.md', false)] }
          : null,
      ),
    );
    rerender(<SpaceSidebar {...props} revision={1} />);
    expect(await screen.findByRole('menuitemradio', { name: 'Uni space' })).toBeInTheDocument();
  });
});

describe('Folder tree', () => {
  it('opens folders to any depth, reading each one when it is first opened', async () => {
    const { user, sidebar, onFolder } = renderSidebar({ activePath: 'Courses' });
    const semester = await within(sidebar).findByRole('group', { name: 'Courses' });
    expect(request).toHaveBeenCalledWith({ action: 'list', path: 'Courses' });
    // Deeper folders start closed and are not read until they are opened.
    const expand = await within(semester).findByRole('button', { name: 'Expand Winter 2026-27' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(request).not.toHaveBeenCalledWith({ action: 'list', path: winter });

    await user.click(expand);
    const second = await within(sidebar).findByRole('group', { name: 'Winter 2026-27' });
    expect(request).toHaveBeenCalledWith({ action: 'list', path: winter });
    expect(request).not.toHaveBeenCalledWith({ action: 'list', path: `${winter}/Datenbanken` });
    expect(await within(second).findByRole('button', { name: 'Mathe' })).toBeVisible();

    await user.click(within(second).getByRole('button', { name: 'Expand Datenbanken' }));
    const third = await within(sidebar).findByRole('group', { name: 'Datenbanken' });
    expect(request).toHaveBeenCalledWith({ action: 'list', path: `${winter}/Datenbanken` });
    expect(await within(third).findByRole('button', { name: 'Folien' })).toBeVisible();

    await user.click(within(third).getByRole('button', { name: 'Expand Skript' }));
    const fourth = await within(sidebar).findByRole('group', { name: 'Skript' });
    expect(await within(fourth).findByRole('button', { name: 'Kapitel 1' })).toBeVisible();

    // Folding a folder folds what is in it, and a second opening needs no new reading.
    request.mockClear();
    await user.click(within(second).getByRole('button', { name: 'Collapse Datenbanken' }));
    expect(within(sidebar).queryByRole('group', { name: 'Datenbanken' })).not.toBeInTheDocument();
    await user.click(within(second).getByRole('button', { name: 'Expand Datenbanken' }));
    expect(await within(sidebar).findByRole('group', { name: 'Datenbanken' })).toBeVisible();
    expect(onFolder).not.toHaveBeenCalled();
  });

  it('shows a deep note, and every folder above it open', async () => {
    const note = `${winter}/Datenbanken/Skript/Kapitel 1.md`;
    const { sidebar } = renderSidebar({
      activePath: `${winter}/Datenbanken/Skript`,
      activeFile: note,
    });
    const deepest = await within(sidebar).findByRole('group', { name: 'Skript' });
    expect(await within(deepest).findByRole('button', { name: 'Kapitel 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const name of ['Courses', 'Winter 2026-27', 'Datenbanken'])
      expect(within(sidebar).getByRole('group', { name })).toBeVisible();
  });

  it('opens the folders above a place the student walks to, once', async () => {
    const user = userEvent.setup();
    const sidebar = () => screen.getByLabelText('Document spaces');
    const props = {
      desktop: true,
      activeFile: null,
      revision: 0,
      iliasCourses: courses,
      onFolder: vi.fn(),
      onFile: vi.fn(),
      onNewNote: vi.fn(),
      onNewFolder: vi.fn(),
      onNewSpace: vi.fn(),
      onEditSpace: vi.fn(),
      onIlias: vi.fn(),
    };
    const { rerender } = render(<SpaceSidebar {...props} activePath="Personal" />);
    await within(sidebar()).findByRole('group', { name: 'Personal' });
    expect(within(sidebar()).queryByRole('group', { name: 'Datenbanken' })).toBeNull();

    rerender(<SpaceSidebar {...props} activePath={`${winter}/Datenbanken`} />);
    expect(await within(sidebar()).findByRole('group', { name: 'Winter 2026-27' })).toBeVisible();

    // The student closes what the walk opened; it stays closed while they stay.
    await user.click(within(sidebar()).getByRole('button', { name: 'Collapse Winter 2026-27' }));
    expect(within(sidebar()).queryByRole('group', { name: 'Winter 2026-27' })).toBeNull();
  });

  it('opens a closed folder when its name is clicked', async () => {
    const user = userEvent.setup();
    render(<Explorer />);
    const sidebar = screen.getByLabelText('Document spaces');
    await user.click(await within(sidebar).findByRole('button', { name: 'Collapse Personal' }));
    expect(within(sidebar).queryByRole('group', { name: 'Personal' })).toBeNull();
    await user.click(within(sidebar).getByRole('button', { name: 'Personal' }));
    expect(await within(sidebar).findByRole('group', { name: 'Personal' })).toBeVisible();
  });

  it('says so when a folder is empty, or cannot be read', async () => {
    const { user, sidebar } = renderSidebar({ activePath: `${winter}/Datenbanken` });
    const semester = await within(sidebar).findByRole('group', { name: 'Winter 2026-27' });
    await user.click(await within(semester).findByRole('button', { name: 'Expand Analysis' }));
    const analysis = await within(sidebar).findByRole('group', { name: 'Analysis' });
    expect(await within(analysis).findByText('Empty folder')).toBeVisible();

    await user.click(within(semester).getByRole('button', { name: 'Expand Mathe' }));
    const mathe = within(sidebar).getByRole('group', { name: 'Mathe' });
    expect(await within(mathe).findByText('This folder could not be read.')).toBeVisible();
  });

  it('collapses every folder at once', async () => {
    const { user, sidebar } = renderSidebar({ activePath: `${winter}/Datenbanken` });
    await within(sidebar).findByRole('group', { name: 'Winter 2026-27' });
    expect(within(sidebar).getAllByRole('group').length).toBeGreaterThan(1);

    await user.click(within(sidebar).getByRole('button', { name: 'Collapse all folders' }));
    expect(within(sidebar).queryAllByRole('group', { name: /^(Courses|Personal|Winter)/ })).toEqual(
      [],
    );
    expect(within(sidebar).getByRole('button', { name: 'Expand Courses' })).toBeVisible();
    expect(within(sidebar).getByRole('button', { name: 'Expand Personal' })).toBeVisible();
    // The folders are only closed: opening one shows what it holds again.
    await user.click(within(sidebar).getByRole('button', { name: 'Expand Personal' }));
    expect(await within(sidebar).findByRole('group', { name: 'Personal' })).toBeVisible();
  });
});

describe('Search in the sidebar', () => {
  const hit = {
    ...entry('Personal/Deep notes.md', false),
    snippet: null,
    matches: 0,
    nameMatch: true,
  };

  beforeEach(() => {
    const base = request.getMockImplementation()!;
    request.mockImplementation((call) =>
      call.action === 'search' ? Promise.resolve([hit]) : base(call),
    );
  });

  it('opens a field from the toolbar, which takes the keyboard, and closes on Escape', async () => {
    const { user, sidebar } = renderSidebar();
    const toggle = within(sidebar).getByRole('button', { name: 'Search all documents' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(toggle);
    const field = within(sidebar).getByRole('textbox', { name: 'Search all documents' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(field).toHaveFocus();

    await user.type(field, 'deep');
    expect(await within(sidebar).findByRole('button', { name: 'Deep notes' })).toBeVisible();
    expect(request).toHaveBeenCalledWith({ action: 'search', query: 'deep' });
    // The results take the tree's place.
    expect(within(sidebar).queryByRole('group', { name: 'Personal' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(within(sidebar).queryByRole('textbox')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(await within(sidebar).findByRole('group', { name: 'Personal' })).toBeVisible();
  });

  it('closes again from the toolbar, and clears the field with its button', async () => {
    const { user, sidebar } = renderSidebar();
    const toggle = within(sidebar).getByRole('button', { name: 'Search all documents' });
    await user.click(toggle);
    const field = within(sidebar).getByRole('textbox', { name: 'Search all documents' });
    await user.type(field, 'deep');
    await user.click(within(sidebar).getByRole('button', { name: 'Clear search' }));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await user.click(toggle);
    expect(within(sidebar).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens a hit and puts the field away', async () => {
    const { user, sidebar, onFile } = renderSidebar();
    await user.click(within(sidebar).getByRole('button', { name: 'Search all documents' }));
    await user.type(within(sidebar).getByRole('textbox'), 'deep');
    await user.click(await within(sidebar).findByRole('button', { name: 'Deep notes' }));
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ path: hit.path }));
    expect(within(sidebar).queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('Favorites view', () => {
  const biology = { path: 'Biology', name: 'Biology', folder: true };
  const cells = { path: 'Biology/Cells.md', name: 'Cells.md', folder: false };

  it('switches between Files and Favorites, and remembers it', async () => {
    const { user, sidebar } = renderSidebar();
    const tabs = within(sidebar).getByRole('tablist', { name: 'Sidebar view' });
    const files = within(tabs).getByRole('tab', { name: 'Files' });
    const favorites = within(tabs).getByRole('tab', { name: 'Favorites' });
    expect(files).toHaveAttribute('aria-selected', 'true');
    expect(within(sidebar).getByRole('tabpanel')).toHaveAccessibleName('Files');

    await user.click(favorites);
    expect(favorites).toHaveAttribute('aria-selected', 'true');
    expect(files).toHaveAttribute('aria-selected', 'false');
    expect(within(sidebar).getByRole('tabpanel')).toHaveAccessibleName('Favorites');
    expect(within(sidebar).queryByRole('button', { name: 'Search all documents' })).toBeNull();
    expect(useDocumentsLayoutStore.getState().sidebarView).toBe('favorites');

    await user.keyboard('{ArrowLeft}');
    expect(files).toHaveAttribute('aria-selected', 'true');
    expect(files).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(favorites).toHaveAttribute('aria-selected', 'true');
  });

  it('starts on the view it was left on', () => {
    useDocumentsLayoutStore.setState({ sidebarView: 'favorites' });
    const { sidebar } = renderSidebar();
    expect(within(sidebar).getByRole('tab', { name: 'Favorites' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens a favorite folder or note, lighting up the one on screen', async () => {
    useDocumentsLayoutStore.setState({ sidebarView: 'favorites' });
    useSidebarStore.setState({ favorites: [biology, cells] });
    const { user, sidebar, onFolder, onFile, rerender, ...handlers } = renderSidebar({
      activePath: 'Biology',
    });
    const panel = within(sidebar).getByRole('tabpanel');
    expect(within(panel).getByRole('button', { name: 'Biology' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(panel).getByRole('button', { name: 'Cells' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(panel).getByRole('button', { name: 'Cells' })).toHaveAttribute(
      'title',
      'Biology/Cells.md',
    );

    await user.click(within(panel).getByRole('button', { name: 'Cells' }));
    expect(onFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Biology/Cells.md', name: 'Cells.md', folder: false }),
    );
    await user.click(within(panel).getByRole('button', { name: 'Biology' }));
    expect(onFolder).toHaveBeenCalledWith('Biology');

    rerender(
      <SpaceSidebar
        desktop
        activePath="Biology"
        activeFile="Biology/Cells.md"
        revision={0}
        iliasCourses={courses}
        onFolder={onFolder}
        onFile={onFile}
        {...handlers}
      />,
    );
    expect(within(panel).getByRole('button', { name: 'Cells' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(panel).getByRole('button', { name: 'Biology' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('removes a favorite from its own button', async () => {
    useDocumentsLayoutStore.setState({ sidebarView: 'favorites' });
    useSidebarStore.setState({ favorites: [biology, cells] });
    const { user, sidebar } = renderSidebar();
    await user.click(within(sidebar).getByRole('button', { name: 'Remove Cells from Favorites' }));
    expect(useSidebarStore.getState().favorites).toEqual([biology]);
    expect(within(sidebar).queryByRole('button', { name: 'Cells' })).not.toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole('button', { name: 'Remove Biology from Favorites' }),
    );
    expect(useSidebarStore.getState().favorites).toEqual([]);
    expect(within(sidebar).getByText(/Drag folders and notes here/)).toBeVisible();
  });

  it('takes a document dropped on the tab or on the panel', async () => {
    const { user, sidebar } = renderSidebar();
    const favorites = within(sidebar).getByRole('tab', { name: 'Favorites' });
    expect(favorites).toHaveAttribute('data-favorites-drop');
    const dataTransfer = createDataTransfer();
    writeDocumentDrag(dataTransfer, biology);

    // A document on its way makes the tab say it is a place to drop on, more so when above it.
    useSidebarStore.getState().setDocumentDrag(biology);
    await waitFor(() => expect(favorites).toHaveClass('is-receiving'));
    expect(favorites).not.toHaveClass('is-over');
    fireEvent.dragOver(favorites, { dataTransfer });
    expect(favorites).toHaveClass('is-over');
    expect(dataTransfer.dropEffect).toBe('link');
    fireEvent.drop(favorites, { dataTransfer });
    expect(useSidebarStore.getState().favorites).toEqual([biology]);
    expect(favorites).not.toHaveClass('is-over');

    // The panel takes drops as well.
    await user.click(favorites);
    const panel = within(sidebar).getByRole('tabpanel');
    expect(panel).toHaveAttribute('data-favorites-drop');
    const other = createDataTransfer();
    writeDocumentDrag(other, cells);
    fireEvent.dragOver(panel, { dataTransfer: other });
    expect(panel).toHaveAttribute('data-over');
    fireEvent.drop(panel, { dataTransfer: other });
    expect(useSidebarStore.getState().favorites.map((item) => item.path)).toEqual([
      'Biology',
      'Biology/Cells.md',
    ]);
    expect(
      await within(panel).findByRole('button', { name: 'Remove Cells from Favorites' }),
    ).toBeVisible();
  });

  it('invites a drag in the empty list, and lights up for a pointer-driven drag', () => {
    useDocumentsLayoutStore.setState({ sidebarView: 'favorites' });
    const { sidebar } = renderSidebar();
    const panel = within(sidebar).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Drag folders and notes here');
    expect(panel).not.toHaveAttribute('data-receiving');

    // The canvas drags with the pointer: the store says what it carries and where it is.
    useSidebarStore.getState().setDocumentDrag(biology, true);
    return waitFor(() => {
      expect(panel).toHaveAttribute('data-receiving');
      expect(panel).toHaveAttribute('data-over');
      expect(panel).toHaveTextContent('Drop to add to Favorites');
      expect(within(sidebar).getByRole('tab', { name: 'Favorites' })).toHaveClass('is-over');
    });
  });

  it('drags rows of the tree towards the favorites', async () => {
    const { sidebar } = renderSidebar();
    const row = (await within(sidebar).findByRole('button', { name: 'Inbox' })).closest(
      '[draggable]',
    )!;
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(row, { dataTransfer });
    expect(useSidebarStore.getState().documentDrag).toEqual({
      path: 'Inbox.md',
      name: 'Inbox.md',
      folder: false,
    });
    fireEvent.dragEnd(row, { dataTransfer });
    expect(useSidebarStore.getState().documentDrag).toBeNull();
  });
});

describe('Folder appearance', () => {
  it('changes a folder without navigating, shares the color with Favorites, and restores focus', async () => {
    useSidebarStore.setState({ favorites: [{ path: 'Personal', name: 'Personal', folder: true }] });
    const { user, sidebar, onFolder } = renderSidebar();
    const trigger = await within(sidebar).findByRole('button', {
      name: 'Customize Personal folder',
    });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Folder appearance' });
    await user.click(within(dialog).getByRole('button', { name: 'Green' }));
    expect(within(dialog).getByRole('button', { name: 'Green' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(sidebar).getByRole('button', { name: 'Personal' }).querySelector('svg'),
    ).toHaveAttribute('data-folder-color', '#53ad87');
    expect(onFolder).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(within(sidebar).getByRole('tab', { name: 'Favorites' }));
    expect(
      within(sidebar).getByRole('button', { name: 'Personal' }).querySelector('svg'),
    ).toHaveAttribute('data-folder-color', '#53ad87');
  });

  it('supports custom colors, outline icons, and resetting the appearance', async () => {
    const { user, sidebar } = renderSidebar();
    await user.click(
      await within(sidebar).findByRole('button', { name: 'Customize Personal folder' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Folder appearance' });
    fireEvent.change(within(dialog).getByLabelText('Custom folder color'), {
      target: { value: '#123abc' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Outline' }));
    expect(useFolderAppearanceStore.getState().appearances.Personal).toEqual({
      color: '#123abc',
      style: 'outline',
    });
    const icon = within(sidebar).getByRole('button', { name: 'Personal' }).querySelector('svg');
    expect(icon).toHaveStyle({ color: '#123abc' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset to default' }));
    expect(within(dialog).getByRole('button', { name: 'Layered' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByLabelText('Custom folder color')).toHaveValue(
      defaultFolderAppearance('Personal').color,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Foot of the sidebar', () => {
  it('lists none of the app pages, which the icon rail beside it holds', () => {
    const { sidebar } = renderSidebar();
    expect(within(sidebar).queryByRole('navigation')).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link')).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('button', { name: /pages$/i })).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('button', { name: 'Toggle color theme' }),
    ).not.toBeInTheDocument();
  });

  it('ends with Recently deleted', () => {
    const { sidebar } = renderSidebar();
    const trash = within(sidebar).getByRole('button', { name: 'Recently deleted' });
    expect(sidebar.lastElementChild).toContainElement(trash);
  });

  it('opens Recently deleted', async () => {
    const { user, sidebar, onFolder } = renderSidebar();
    await user.click(within(sidebar).getByRole('button', { name: 'Recently deleted' }));
    expect(onFolder).toHaveBeenCalledWith('.trash');
  });
});
