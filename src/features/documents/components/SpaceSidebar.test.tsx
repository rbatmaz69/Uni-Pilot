import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaceSidebar } from '@/features/documents/components/SpaceSidebar';
import {
  documentRequest,
  type DocumentEntry,
  type IliasCourse,
} from '@/features/documents/lib/files';
import { useSpaceStore } from '@/features/documents/store/spaceStore';

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
    dock: screen.getByRole('navigation', { name: 'Spaces' }),
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
      onNewSpace={vi.fn()}
      onEditSpace={vi.fn()}
      onIlias={setPath}
    />
  );
}

describe('Space sidebar', () => {
  it('docks Documents and ILIAS, not a space for every folder', async () => {
    const { dock, sidebar } = renderSidebar();
    await within(sidebar).findByRole('button', { name: 'Personal' });
    expect(
      within(dock)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Documents', 'ILIAS, 2 new', 'New space']);
    expect(within(dock).getByRole('button', { name: 'Documents' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the whole workspace in Documents, folders open and notes loose', async () => {
    const { sidebar } = renderSidebar();
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(sidebar).not.toHaveAttribute('data-tone');
    const routines = await within(sidebar).findByRole('group', { name: 'Personal' });
    expect(await within(routines).findByRole('button', { name: 'Routines' })).toBeVisible();
    expect(within(sidebar).getByRole('button', { name: 'Inbox' })).toBeVisible();
  });

  it('stays in the space it started in when a folder that is a space opens', async () => {
    useSpaceStore.setState({ spaces: [personal] });
    const user = userEvent.setup();
    render(<Explorer />);
    const sidebar = screen.getByLabelText('Document spaces');
    await user.click(await within(sidebar).findByRole('button', { name: 'Personal' }));
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    // The dock takes the student into the space.
    await user.click(screen.getByRole('button', { name: 'Personal space' }));
    expect(within(sidebar).getByRole('heading', { name: 'Personal' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Documents' }));
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
  });

  it('shows no number but how many files are new, and a dot on a new file', async () => {
    useSpaceStore.setState({ spaces: [uni], picked: 'uni' });
    const { dock, sidebar } = renderSidebar({ activePath: `${winter}/Datenbanken` });
    expect(await within(dock).findByRole('button', { name: 'Uni space, 4 new' })).toBeVisible();
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

  it('starts a note in the folder of the open space', async () => {
    useSpaceStore.setState({ spaces: [personal], picked: 'personal' });
    const { user, sidebar, onNewNote, onNewSpace, dock } = renderSidebar({
      activePath: 'Personal/Routines',
    });
    await user.click(within(sidebar).getByRole('button', { name: 'New note' }));
    expect(onNewNote).toHaveBeenCalledWith('Personal');
    await user.click(within(dock).getByRole('button', { name: 'New space' }));
    expect(onNewSpace).toHaveBeenCalled();
  });

  it('edits or removes an added space, keeping its folder', async () => {
    useSpaceStore.setState({ spaces: [personal], picked: 'personal' });
    const { user, sidebar, dock, onEditSpace } = renderSidebar({ activePath: 'Personal' });
    await user.click(within(sidebar).getByRole('button', { name: 'Space options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit space' }));
    expect(onEditSpace).toHaveBeenCalledWith(personal);

    await user.click(within(sidebar).getByRole('button', { name: 'Space options' }));
    await user.click(screen.getByRole('menuitem', { name: /Remove from the dock/ }));
    expect(useSpaceStore.getState().spaces).toEqual([]);
    expect(within(dock).queryByRole('button', { name: 'Personal space' })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'trash' }));
  });

  it('says so when the folder of a space is gone', async () => {
    useSpaceStore.setState({ spaces: [{ ...personal, folder: 'Gone' }], picked: 'personal' });
    const { user, sidebar, onEditSpace } = renderSidebar({ activePath: 'Gone' });
    expect(await within(sidebar).findByRole('alert')).toHaveTextContent('folder is missing');
    await user.click(within(sidebar).getByRole('button', { name: 'Choose another folder' }));
    expect(onEditSpace).toHaveBeenCalled();
  });

  it('gathers the synced courses in the ILIAS space, with how many files are new', async () => {
    const { user, sidebar, dock, onIlias } = renderSidebar({ activePath: ':ilias' });
    expect(within(dock).getByRole('button', { name: 'ILIAS, 2 new' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(sidebar).getByRole('heading', { name: 'ILIAS' })).toBeVisible();
    expect(within(sidebar).getByRole('button', { name: 'Analysis' })).toBeVisible();
    await user.click(
      within(sidebar).getByRole('button', { name: 'Datenbanken 1 - WS26 2 new files' }),
    );
    expect(onIlias).toHaveBeenCalledWith(datenbanken);
    expect(within(sidebar).queryByRole('button', { name: 'New note' })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith({ action: 'list', path: ':ilias' });
  });

  it('opens a synced course folder in the ILIAS space when no space was picked', async () => {
    const { user, sidebar, dock, onIlias } = renderSidebar({ activePath: `${datenbanken}/Folien` });
    expect(within(sidebar).getByRole('heading', { name: 'ILIAS' })).toBeVisible();
    expect(
      within(sidebar).getByRole('button', { name: 'Datenbanken 1 - WS26 2 new files' }),
    ).toHaveAttribute('aria-current', 'page');
    await user.click(within(dock).getByRole('button', { name: 'ILIAS, 2 new' }));
    expect(onIlias).toHaveBeenCalledWith(':ilias');
  });

  it('opens a course in the ILIAS space, and takes one dropped onto Documents', () => {
    const onIliasCourse = vi.fn();
    const onAddCourse = vi.fn();
    const { sidebar, dock } = renderSidebar({ activePath: ':ilias', onIliasCourse, onAddCourse });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Analysis' }));
    expect(onIliasCourse).toHaveBeenCalledWith('8');

    const documents = within(dock).getByRole('button', { name: 'Documents' });
    const carried = new Map([['application/x-uni-pilot-course', '100100']]);
    const dataTransfer = {
      types: [...carried.keys()],
      getData: (type: string) => carried.get(type) ?? '',
      dropEffect: 'none',
    };
    fireEvent.dragOver(documents, { dataTransfer });
    expect(documents).toHaveClass('is-drop-target');
    fireEvent.drop(documents, { dataTransfer });
    expect(onAddCourse).toHaveBeenCalledWith('100100');
    expect(documents).not.toHaveClass('is-drop-target');
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
      onNewSpace: vi.fn(),
      onEditSpace: vi.fn(),
      onIlias: vi.fn(),
    };
    const { rerender } = render(<SpaceSidebar {...props} revision={0} />);
    await screen.findByRole('button', { name: 'Uni space, 4 new' });
    request.mockImplementation((call) =>
      Promise.resolve(
        call.action === 'list'
          ? { root: '/workspace', entries: [entry('Courses/Plan.md', false)] }
          : null,
      ),
    );
    rerender(<SpaceSidebar {...props} revision={1} />);
    expect(await screen.findByRole('button', { name: 'Uni space' })).toBeInTheDocument();
  });
});
