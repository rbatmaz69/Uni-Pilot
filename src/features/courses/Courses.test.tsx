/**
 * The Courses page across the shell: courses from ILIAS by area, a course's
 * folders and files, an exercise's assignments, and what the page says when
 * ILIAS has forgotten the sign-in. Rust is a stand-in answering like the
 * readers do against the recorded HHN pages.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IliasAssignment,
  IliasContentItem,
  IliasCourse,
} from '@/features/integrations/lib/iliasSync';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { renderApp } from '@/test/render';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

// The whole shell renders, and it asks `isTauri` too; only `invoke` is faked.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => Promise.resolve(() => undefined),
}));

const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

const COURSES: IliasCourse[] = [
  {
    refId: '100100',
    providerType: 'crs',
    title: '100001 Beispielsysteme 1 - WS25',
    description: 'Vorlesung und Labor',
    area: 'H3 Labor für Beispielsysteme',
    online: true,
    period: null,
    properties: [],
  },
  {
    refId: '100200',
    providerType: 'crs',
    title: '100002 Beispieltheorie 2026 SS',
    description: null,
    area: 'H2 Beispiele, Theorie und Verteilung',
    online: false,
    period: { start: '2026-03-01', end: '2026-07-31' },
    properties: [],
  },
];

const row = (overrides: Partial<IliasContentItem>): IliasContentItem => ({
  refId: '0',
  parentRefId: '100100',
  providerType: 'fold',
  title: '',
  description: null,
  block: 'Part 1',
  file: null,
  properties: [],
  ...overrides,
});

const COURSE_CONTENTS = [
  row({ refId: '100120', title: 'Material' }),
  row({
    refId: '100130',
    providerType: 'exc',
    title: 'Abgabe der Projektaufgabe',
    block: 'Part 2',
  }),
];

const FOLDER_CONTENTS = [
  row({
    refId: '100121',
    parentRefId: '100120',
    providerType: 'file',
    title: 'Beispiel_DB',
    block: 'Inhalt',
    file: { suffix: 'backup', size: 51087, version: 3, updatedAt: '2025-09-15T08:41' },
  }),
];

const ASSIGNMENTS: IliasAssignment[] = [
  {
    assId: '30001',
    exerciseRefId: '100130',
    title: 'Abgabe der Projektaufgabe',
    section: 'Vergangene',
    state: 'Beendet',
    startsAt: null,
    dueAt: '2025-12-22T23:55',
    mandatory: true,
    submittedAt: null,
    grade: 'Nicht bewertet',
    properties: [],
  },
];

/** Answers as Rust would; the commands in `signedOut` find the sign-in gone. */
function answerLikeRust(signedOut: string[] = []) {
  const forgotten = vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'signedOut' });
  invoke.mockImplementation((command, args) => {
    if (signedOut.includes(command)) return forgotten();
    switch (command) {
      case 'ilias_sync_courses':
        return Promise.resolve(COURSES);
      case 'ilias_sync_contents':
        return Promise.resolve(
          args.containerRefId === '100120' ? FOLDER_CONTENTS : COURSE_CONTENTS,
        );
      case 'ilias_sync_assignments':
        return Promise.resolve(ASSIGNMENTS);
      case 'ilias_sync_download':
        return Promise.resolve({ id: 7, fileName: 'Beispiel_DB.backup', openable: false });
      default:
        return Promise.resolve(undefined);
    }
  });
}

beforeEach(() => {
  invoke.mockReset();
  answerLikeRust();
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useCourseStore.setState({
    installation: null,
    courses: null,
    contents: {},
    assignments: {},
    failure: null,
    loading: {},
    downloads: {},
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

describe('before there is anything to read', () => {
  it('sends a browser tab to the desktop app', () => {
    renderApp('/courses');
    expect(
      screen.getByRole('heading', { name: 'Your courses come from the desktop app' }),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('ilias_sync_courses', expect.anything());
  });

  it('asks to connect ILIAS first', () => {
    pretendDesktop();
    useIliasStore.setState({ connection: null });
    renderApp('/courses');
    expect(screen.getByRole('link', { name: 'Connect ILIAS' })).toHaveAttribute('href', '/ilias');
  });
});

describe('the course list', () => {
  it('shows courses by study area, and offline ones apart', async () => {
    pretendDesktop();
    renderApp('/courses');

    const area = await screen.findByRole('region', { name: 'H3 Labor für Beispielsysteme' });
    const link = within(area).getByRole('link', { name: /Beispielsysteme 1 - WS25/ });
    expect(link).toHaveTextContent('100001');

    const offline = screen.getByRole('region', { name: 'Offline in ILIAS' });
    expect(within(offline).getByText('Beispieltheorie 2026 SS')).toBeInTheDocument();
    expect(within(offline).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('inside a course', () => {
  it('opens a folder and describes its files without downloading them', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/courses');

    await user.click(await screen.findByRole('link', { name: /Beispielsysteme 1 - WS25/ }));
    expect(await screen.findByRole('region', { name: 'Part 1' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Part 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Material/ }));
    const file = await screen.findByText('Beispiel_DB');
    const item = file.closest('li') as HTMLElement;
    expect(within(item).getByText('Version 3')).toBeInTheDocument();
    expect(within(item).getByText('BACKUP · 49.9 KB · 15 Sep 2025, 08:41')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Open in ILIAS' })).toBeInTheDocument();

    const trail = screen.getByRole('navigation', { name: 'Where you are in the course' });
    expect(within(trail).getByText('Material')).toHaveAttribute('aria-current', 'page');
    expect(invoke).toHaveBeenCalledWith('ilias_sync_contents', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      container: 'fold',
      containerRefId: '100120',
    });
  });

  it('downloads a file on a click and shows where it went', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/courses?course=100100&trail=100120');

    await user.click(await screen.findByRole('button', { name: 'Download Beispiel_DB' }));
    expect(await screen.findByText('Saved to Downloads')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('ilias_sync_download', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      fileRefId: '100121',
    });

    // A backup is not a document: Uni Pilot shows it in its folder, it does not run it.
    expect(screen.queryByRole('button', { name: 'Open Beispiel_DB' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Beispiel_DB in its folder' }));
    expect(invoke).toHaveBeenCalledWith('reveal_ilias_download', { id: 7 });
  });

  it("lists an exercise's assignments with deadline and hand-in", async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/courses?course=100100');

    await user.click(await screen.findByRole('link', { name: /Abgabe der Projektaufgabe/ }));
    const past = await screen.findByRole('region', { name: 'Vergangene' });
    expect(within(past).getByText('Ended · 22 Dec 2025, 23:55')).toBeInTheDocument();
    expect(within(past).getByText('Not handed in')).toBeInTheDocument();
    expect(within(past).getByText('Mandatory')).toBeInTheDocument();
    expect(within(past).getByText('Nicht bewertet')).toBeInTheDocument();
  });
});

describe('asking about an assignment', () => {
  it('opens a draft in Mail with the course and assignment as subject', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/courses?course=100100');

    await user.click(await screen.findByRole('link', { name: /Abgabe der Projektaufgabe/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Email about Abgabe der Projektaufgabe' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    expect(within(dialog).getByLabelText('Subject')).toHaveValue(
      'Beispielsysteme 1 - WS25 – Abgabe der Projektaufgabe',
    );
    await user.type(within(dialog).getByLabelText('To'), 'prof@hs-heilbronn.de');
    await user.click(screen.getByRole('button', { name: 'Open draft in Mail' }));

    expect(invoke).toHaveBeenCalledWith('mail_compose', {
      draft: {
        from: null,
        to: ['prof@hs-heilbronn.de'],
        subject: 'Beispielsysteme 1 - WS25 – Abgabe der Projektaufgabe',
        body: '',
      },
    });
  });
});

describe('when ILIAS has forgotten the sign-in', () => {
  it('keeps what it read and offers to sign in', async () => {
    pretendDesktop();
    useCourseStore.setState({
      installation: 'ilias.hs-heilbronn.de',
      courses: { items: COURSES, loadedAt: '2026-09-25T09:00:00.000Z' },
    });
    answerLikeRust(['ilias_sync_courses']);
    const user = userEvent.setup();
    renderApp('/courses');

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Sign in to ILIAS to update');
    expect(screen.getByRole('link', { name: /Beispielsysteme 1 - WS25/ })).toBeInTheDocument();

    await user.click(within(notice).getByRole('button', { name: 'Sign in to ILIAS' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'ILIAS: Hochschule Heilbronn' }),
    ).toBeInTheDocument();
  });
});
