import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IliasOverview } from '@/features/documents/components/IliasOverview';
import { documentRequest, type IliasCourse, type IliasFile } from '@/features/documents/lib/files';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type { IliasCourse as ListedCourse } from '@/features/integrations/lib/iliasSync';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));

const winter = 'Courses/Winter 2026-27';
const datenbanken = `${winter}/Datenbanken/ILIAS`;
const analysis = `${winter}/Analysis II/ILIAS`;
const file = (root: string, name: string, updatedAt: string, extra: Partial<IliasFile> = {}) => ({
  name,
  path: `${root}/Folien/${name}`,
  size: 10,
  updatedAt,
  arrived: 0,
  ...extra,
});
const kept: IliasCourse[] = [
  {
    courseRefId: '7',
    title: '262009 Datenbanken 1 - WS26',
    root: datenbanken,
    syncedAt: null,
    unseen: 1,
    files: [
      file(datenbanken, 'Blatt 6.pdf', '2026-10-08T10:00', { unseen: true }),
      file(datenbanken, 'Kapitel 1.pdf', '2026-09-24T17:05'),
    ],
  },
  {
    courseRefId: '8',
    title: 'Analysis II - WS26',
    root: analysis,
    syncedAt: null,
    unseen: 0,
    files: [file(analysis, 'Skript.pdf', '2026-10-01T08:00', { gone: true })],
  },
];
const listed = (refId: string, title: string, online = true): ListedCourse => ({
  refId,
  providerType: 'crs',
  title,
  description: null,
  area: 'Fakultät für Informatik',
  online,
  period: null,
  properties: [],
});

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};
const { loadCourses } = useCourseStore.getState();
const { load } = useCourseFilesStore.getState();

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  vi.mocked(documentRequest).mockResolvedValue({ root: '/workspace', entries: [] });
  useIliasStore.setState({ connection: null });
  useCourseStore.setState({ courses: null, loading: {}, failure: null });
  useCourseFilesStore.setState({ folders: null, syncing: {}, failures: {}, waiting: [] });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  useCourseStore.setState({ loadCourses });
  useCourseFilesStore.setState({ load });
});

function renderOverview(courses: IliasCourse[] | null = kept) {
  const onOpen = vi.fn();
  const onAddCourse = vi.fn();
  const onAddAllCourses = vi.fn();
  render(
    <MemoryRouter>
      <IliasOverview
        courses={courses}
        course={null}
        onOpen={onOpen}
        onAddCourse={onAddCourse}
        onAddAllCourses={onAddAllCourses}
      />
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onOpen, onAddCourse, onAddAllCourses };
}

describe('ILIAS overview', () => {
  it('shows every course as a folder with the ILIAS mark, the kept ones first', async () => {
    useCourseStore.setState({
      courses: {
        items: [
          listed('9', '262147 Informationssicherheit'),
          listed('7', '262009 Datenbanken 1 - WS26'),
          listed('10', 'Arbeitssicherheit 2024 WS', false),
        ],
        loadedAt: '2026-09-28T10:00:00.000Z',
      },
    });
    const { user, onAddCourse } = renderOverview();
    const row = screen.getByRole('list', { name: 'Your courses' });
    const cards = within(row).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Analysis II - WS26',
      'Datenbanken 1 - WS26, 1 new',
      'Informationssicherheit',
    ]);
    for (const card of cards)
      expect(within(card).getByRole('img', { name: 'Synced from ILIAS' })).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('img', { name: '1 new file' })).toHaveTextContent('1');
    expect(cards[1]).toHaveAttribute('href', '/documents?path=%3Ailias&course=7');
    expect(cards[1]).toHaveTextContent('262009');
    expect(cards[2]).toHaveTextContent('Not in Documents');
    expect(cards[2]).toHaveAttribute('draggable', 'true');
    expect(cards[1]).toHaveAttribute('draggable', 'false');

    // Only a course that is not in Documents yet can be added.
    const add = within(row).getAllByRole('button', { name: 'Add to Documents' });
    expect(add).toHaveLength(1);
    await user.click(add[0]!);
    expect(onAddCourse).toHaveBeenCalledWith('9');

    expect(
      within(screen.getByRole('region', { name: 'Offline in ILIAS' })).getByText(
        'Arbeitssicherheit 2024 WS',
      ),
    ).toBeInTheDocument();
  });

  it('adds every course at once, and shows which wait their turn', async () => {
    useIliasStore.setState({ connection: HHN });
    // Reading ILIAS is the stores' business; here the list is already read.
    useCourseStore.setState({ loadCourses: vi.fn(() => Promise.resolve()) });
    useCourseFilesStore.setState({ load: vi.fn(() => Promise.resolve()) });
    const courses = [
      listed('7', '262009 Datenbanken 1 - WS26'),
      listed('9', '262147 Informationssicherheit'),
      listed('11', 'Betriebssysteme'),
      listed('10', 'Arbeitssicherheit 2024 WS', false),
    ];
    useCourseStore.setState({
      courses: { items: courses, loadedAt: '2026-09-28T10:00:00.000Z' },
    });
    const { user, onAddAllCourses } = renderOverview();

    // The two online courses not in Documents yet; the offline one is not offered.
    await user.click(screen.getByRole('button', { name: 'Add all 2 courses' }));
    expect(onAddAllCourses).toHaveBeenCalledTimes(1);

    act(() => useCourseFilesStore.setState({ syncing: { '9': null }, waiting: [courses[2]!] }));
    const row = screen.getByRole('list', { name: 'Your courses' });
    const card = (name: string) => screen.getByRole('link', { name }).closest('li')!;
    expect(within(card('Informationssicherheit')).getByRole('status')).toHaveTextContent(
      'Adding to Documents…',
    );
    expect(within(card('Betriebssysteme')).getByRole('status')).toHaveTextContent('Waiting…');
    expect(within(row).queryByRole('button', { name: 'Add to Documents' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 waiting to be added…' })).toBeDisabled();
  });

  it('shows how far a course being added has come', () => {
    useCourseStore.setState({
      courses: { items: [listed('9', 'Informationssicherheit')], loadedAt: '2026-09-28' },
    });
    useCourseFilesStore.setState({
      syncing: { '9': { courseRefId: '9', phase: 'downloading', done: 3, total: 12, title: null } },
    });
    renderOverview([]);
    expect(screen.getByRole('status')).toHaveTextContent('Adding · 3 of 12');
    expect(screen.queryByRole('button', { name: 'Add to Documents' })).not.toBeInTheDocument();
  });

  it('lists the newest files of all kept courses below, and opens one', async () => {
    const { user, onOpen } = renderOverview();
    const table = screen.getByRole('table', { name: 'Newest files from all your courses' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent?.trim()),
      ),
    ).toEqual([
      ['Blatt 6.pdf', 'Datenbanken 1 - WS26', 'Thu, 8 Oct 2026'],
      ['Skript.pdfNo longer on ILIAS', 'Analysis II - WS26', 'Thu, 1 Oct 2026'],
      ['Kapitel 1.pdf', 'Datenbanken 1 - WS26', 'Thu, 24 Sep 2026'],
    ]);
    await user.click(within(rows[0]!).getByRole('button', { name: 'Blatt 6.pdf New' }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${datenbanken}/Folien/Blatt 6.pdf`, unseen: 1 }),
    );
  });

  it('asks to connect ILIAS, still showing the courses already in Documents', () => {
    renderOverview();
    expect(screen.getByRole('link', { name: 'Connect ILIAS' })).toHaveAttribute('href', '/ilias');
    expect(
      within(screen.getByRole('list', { name: 'Your courses' })).getAllByRole('link'),
    ).toHaveLength(2);
  });

  it('sends a browser tab to the desktop app', () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    renderOverview();
    expect(
      screen.getByRole('heading', { name: 'Your courses come from the desktop app' }),
    ).toBeInTheDocument();
  });
});
