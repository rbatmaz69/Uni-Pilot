import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type {
  CourseFolder,
  CourseSyncReport,
  IliasContentItem,
  IliasCourse,
} from '@/features/integrations/lib/iliasSync';
import { useCourseStore } from './courseStore';
import { AUTO_SYNC_MS, resetCourseFilesListening, useCourseFilesStore } from './courseFilesStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};

const COURSE: IliasCourse = {
  refId: '100100',
  providerType: 'crs',
  title: '262058 Datenbanken 1 - WS25',
  description: null,
  area: null,
  online: true,
  period: null,
  properties: [],
};

const TARGET = {
  refId: '100100',
  container: 'crs',
  title: 'Datenbanken 1',
  semester: 'Winter 2025-26',
};

function folder(change: Partial<CourseFolder> = {}): CourseFolder {
  return {
    courseRefId: '100100',
    courseTitle: 'Datenbanken 1',
    root: 'Courses/Winter 2025-26/Datenbanken 1/ILIAS',
    auto: false,
    excluded: [],
    syncedAt: null,
    folders: [],
    files: {},
    ...change,
  };
}

function report(summary: CourseFolder): CourseSyncReport {
  return {
    summary,
    added: [`${summary.root}/Blatt 1.pdf`],
    updated: [],
    kept: [],
    tooLarge: [],
    gone: 0,
    failed: [],
  };
}

const calls = (command: string) => invoke.mock.calls.filter(([name]) => name === command);

beforeEach(() => {
  invoke.mockReset();
  resetCourseFilesListening();
  useCourseStore.setState({ failure: null });
  useCourseFilesStore.setState({
    installation: null,
    folders: null,
    syncing: {},
    reports: {},
    failures: {},
    saving: {},
    waiting: [],
  });
});

describe('the course files store', () => {
  it('reads which courses keep their files here', async () => {
    invoke.mockResolvedValue([folder()]);
    await useCourseFilesStore.getState().load(HHN);
    expect(invoke).toHaveBeenCalledWith('ilias_mirror_list', { baseUrl: HHN.baseUrl });
    expect(useCourseFilesStore.getState().folders).toEqual({ '100100': folder() });
  });

  /** Switching a course on is the student's choice to sync it, from now on too. */
  it('creates the folder on the first sync and syncs automatically after that', async () => {
    invoke.mockImplementation((command) =>
      Promise.resolve(
        command === 'ilias_mirror_course'
          ? report(folder())
          : command === 'ilias_mirror_configure'
            ? folder({ auto: true })
            : [],
      ),
    );
    const running = useCourseFilesStore.getState().sync(HHN, COURSE);
    expect(useCourseFilesStore.getState().syncing).toEqual({ '100100': null });
    await running;

    expect(calls('ilias_mirror_course')[0]?.[1]).toMatchObject({ course: TARGET });
    expect(calls('ilias_mirror_configure')[0]?.[1]).toMatchObject({
      courseRefId: '100100',
      auto: true,
    });
    const state = useCourseFilesStore.getState();
    expect(state.folders?.['100100']?.auto).toBe(true);
    expect(state.reports['100100']?.added).toHaveLength(1);
    expect(state.syncing).toEqual({});
  });

  it('leaves automatic syncing as the student set it on later syncs', async () => {
    useCourseFilesStore.setState({
      installation: 'ilias.hs-heilbronn.de',
      folders: { '100100': folder() },
    });
    invoke.mockResolvedValue(report(folder({ syncedAt: '2026-10-01T08:00:00Z' })));
    await useCourseFilesStore.getState().sync(HHN, COURSE);
    expect(calls('ilias_mirror_configure')).toHaveLength(0);
    expect(useCourseFilesStore.getState().folders?.['100100']?.syncedAt).toBe(
      '2026-10-01T08:00:00Z',
    );
  });

  it('adds every online course not in Documents yet, one after another', async () => {
    const course = (refId: string, title: string, online = true): IliasCourse => ({
      ...COURSE,
      refId,
      title,
      online,
    });
    let running = 0;
    let most = 0;
    invoke.mockImplementation(async (command, args) => {
      if (command === 'ilias_mirror_list') return [folder()];
      const refId = String(
        (args.course as { refId?: string } | undefined)?.refId ?? args.courseRefId,
      );
      const kept = folder({ courseRefId: refId, root: `Courses/${refId}/ILIAS` });
      if (command === 'ilias_mirror_configure') return { ...kept, auto: true };
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return report(kept);
    });
    const done = useCourseFilesStore
      .getState()
      .syncAll(HHN, [
        COURSE,
        course('200', 'Analysis'),
        course('300', 'Betriebssysteme'),
        course('400', 'Arbeitssicherheit', false),
      ]);
    // A second click while they run adds nothing twice.
    const again = useCourseFilesStore.getState().syncAll(HHN, [course('300', 'Betriebssysteme')]);
    await Promise.all([done, again]);

    // The course already kept and the offline one are left alone.
    expect(calls('ilias_mirror_course').map(([, args]) => args.course)).toEqual([
      expect.objectContaining({ refId: '200' }),
      expect.objectContaining({ refId: '300' }),
    ]);
    expect(most).toBe(1);
    // Each is kept in sync from now on, like a course added on its own.
    expect(calls('ilias_mirror_configure').map(([, args]) => args)).toEqual([
      expect.objectContaining({ courseRefId: '200', auto: true }),
      expect.objectContaining({ courseRefId: '300', auto: true }),
    ]);
    const state = useCourseFilesStore.getState();
    expect(Object.keys(state.folders ?? {}).sort()).toEqual(['100100', '200', '300']);
    expect(state.waiting).toEqual([]);
    expect(state.syncing).toEqual({});
  });

  it('stops adding courses once the sign-in has ended', async () => {
    // Rust rejects with the error's shape, not an Error.
    const signedOut = vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'signedOut' });
    invoke.mockImplementation((command) =>
      command === 'ilias_sync_reauth'
        ? Promise.resolve(false)
        : command === 'ilias_mirror_list'
          ? Promise.resolve([])
          : signedOut(),
    );
    await useCourseFilesStore.getState().syncAll(HHN, [
      { ...COURSE, refId: '200' },
      { ...COURSE, refId: '300' },
    ]);
    expect(calls('ilias_mirror_course')).toHaveLength(1);
    expect(useCourseStore.getState().failure?.kind).toBe('session-expired');
    expect(useCourseFilesStore.getState().waiting).toEqual([]);
  });

  it('tells the page when the sign-in has ended', async () => {
    // Rust rejects with the error's shape, not an Error.
    const signedOut = vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'signedOut' });
    invoke.mockImplementation((command) =>
      command === 'ilias_sync_reauth'
        ? Promise.resolve(false)
        : command === 'ilias_mirror_list'
          ? Promise.resolve([])
          : signedOut(),
    );
    await useCourseFilesStore.getState().sync(HHN, COURSE);
    expect(useCourseFilesStore.getState().failures['100100']?.kind).toBe('session-expired');
    expect(useCourseStore.getState().failure?.kind).toBe('session-expired');
    expect(useCourseFilesStore.getState().syncing).toEqual({});
  });

  it('syncs on its own only courses switched to automatic, and not too often', async () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const recent = new Date(now.getTime() - AUTO_SYNC_MS / 2).toISOString();
    const old = new Date(now.getTime() - AUTO_SYNC_MS * 2).toISOString();
    const courses = ['1', '2', '3', '4'].map((refId) => ({ ...COURSE, refId }));
    useCourseFilesStore.setState({
      installation: 'ilias.hs-heilbronn.de',
      folders: {
        '1': folder({ courseRefId: '1', auto: true, syncedAt: old }),
        '2': folder({ courseRefId: '2', auto: true, syncedAt: recent }),
        '3': folder({ courseRefId: '3', auto: false, syncedAt: old }),
        '4': folder({ courseRefId: '4', auto: true, syncedAt: null }),
        '5': folder({ courseRefId: '5', auto: true, syncedAt: null }),
      },
    });
    invoke.mockImplementation((_, args) => {
      const refId = (args.course as { refId: string }).refId;
      return Promise.resolve(report(folder({ courseRefId: refId, auto: true })));
    });
    await useCourseFilesStore.getState().syncDue(HHN, courses, now);
    // Course 5 has a folder but is no longer in the course list.
    expect(
      calls('ilias_mirror_course').map(([, args]) => (args.course as { refId: string }).refId),
    ).toEqual(['1', '4']);
  });

  it('saves a clicked file into the course folder and notes where', async () => {
    const file: IliasContentItem = {
      refId: '100121',
      parentRefId: '100120',
      providerType: 'file',
      title: 'Blatt 1',
      description: null,
      block: null,
      file: { suffix: 'pdf', size: 1000, version: 1, updatedAt: null },
      properties: [],
    };
    const saved = {
      path: 'Courses/Winter 2025-26/Datenbanken 1/ILIAS/Übungen/Blatt 1.pdf',
      state: 'synced',
      version: 1,
    };
    invoke.mockImplementation((command) =>
      Promise.resolve(command === 'ilias_mirror_file' ? saved : [folder()]),
    );
    const trail = [{ refId: '100120', title: 'Übungen' }];
    const running = useCourseFilesStore.getState().saveFile(HHN, COURSE, trail, file);
    expect(useCourseFilesStore.getState().saving['100121']).toEqual({ state: 'saving' });
    await running;

    expect(calls('ilias_mirror_file')[0]?.[1]).toMatchObject({ course: TARGET, trail });
    expect(useCourseFilesStore.getState().saving['100121']).toEqual({
      state: 'saved',
      file: saved,
    });
    expect(calls('ilias_mirror_list')).toHaveLength(1);
  });

  it('switches a folder off and on again', async () => {
    useCourseFilesStore.setState({
      installation: 'ilias.hs-heilbronn.de',
      folders: { '100100': folder() },
    });
    invoke.mockImplementation((_, args) =>
      Promise.resolve(folder({ excluded: args.excluded as string[] })),
    );
    await useCourseFilesStore.getState().setFolderSynced(HHN, '100100', '200', false);
    expect(useCourseFilesStore.getState().folders?.['100100']?.excluded).toEqual(['200']);
    await useCourseFilesStore.getState().setFolderSynced(HHN, '100100', '200', true);
    expect(useCourseFilesStore.getState().folders?.['100100']?.excluded).toEqual([]);
  });

  it('forgets a course that stopped syncing, and leaves its files to the student', async () => {
    useCourseFilesStore.setState({
      installation: 'ilias.hs-heilbronn.de',
      folders: { '100100': folder() },
    });
    invoke.mockResolvedValue(undefined);
    await useCourseFilesStore.getState().stop(HHN, '100100');
    expect(invoke).toHaveBeenCalledWith('ilias_mirror_detach', {
      baseUrl: HHN.baseUrl,
      courseRefId: '100100',
    });
    expect(useCourseFilesStore.getState().folders).toEqual({});
  });

  it('follows the progress of running syncs only', () => {
    useCourseFilesStore.setState({ syncing: { '100100': null } });
    const progress = {
      courseRefId: '100100',
      phase: 'downloading' as const,
      done: 2,
      total: 9,
      title: 'Blatt 3',
    };
    useCourseFilesStore.getState().progress(progress);
    useCourseFilesStore.getState().progress({ ...progress, courseRefId: '7' });
    expect(useCourseFilesStore.getState().syncing).toEqual({ '100100': progress });
  });
});
