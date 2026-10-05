/**
 * Which courses keep their files in Documents, and how their syncs stand.
 *
 * The truth is on disk: each synced course has an `ILIAS` folder with a
 * manifest, and `listCourseFolders` reads them all. So nothing here is
 * persisted — a folder the student moved, or a course they stopped syncing in
 * the document explorer, reads right the next time.
 *
 * Syncing downloads files, which ILIAS counts as reading them. So a course
 * syncs only after the student switched it on, and on its own only while
 * `auto` is on — at most every `AUTO_SYNC_MS`, when the course list was read
 * anyway (`CourseSync`).
 */

import { create } from 'zustand';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  configureCourseFolder,
  listCourseFolders,
  listenToCourseSync,
  saveCourseFile,
  stopSyncingCourse,
  syncCourseFiles,
  type CourseFile,
  type CourseFolder,
  type CourseSyncProgress,
  type CourseSyncReport,
  type IliasContentItem,
  type IliasCourse,
} from '@/features/integrations/lib/iliasSync';
import { courseTarget } from '@/features/courses/lib/semester';
import {
  asFailure,
  hostOf,
  useCourseStore,
  withRenewal,
  type CourseFailure,
} from '@/features/courses/store/courseStore';

/** How long an automatic sync waits after the last one. */
export const AUTO_SYNC_MS = 3 * 60 * 60 * 1000;

/** Where a file the student clicked stands. */
export type FileSaving =
  { state: 'saving' } | { state: 'saved'; file: CourseFile } | { state: 'failed'; message: string };

interface CourseFilesState {
  /** The host the folders below were read for. */
  installation: string | null;
  /** By course ref_id; null until read. */
  folders: Record<string, CourseFolder> | null;
  /** Running syncs, by course ref_id: the latest progress, or null before any. */
  syncing: Record<string, CourseSyncProgress | null>;
  /** What the last sync of each course did, this session. */
  reports: Record<string, CourseSyncReport>;
  /** Why the latest action for a course gave nothing. */
  failures: Record<string, CourseFailure>;
  /** Files asked for by a click, by file ref_id. */
  saving: Record<string, FileSaving>;

  load: (connection: IliasConnection) => Promise<void>;
  /** Syncs a course now; the first time, this creates its folder and switches on `auto`. */
  sync: (connection: IliasConnection, course: IliasCourse) => Promise<void>;
  /** Syncs every `auto` course that is due, one after another. */
  syncDue: (connection: IliasConnection, courses: IliasCourse[], now?: Date) => Promise<void>;
  saveFile: (
    connection: IliasConnection,
    course: IliasCourse,
    trail: { refId: string; title: string }[],
    file: IliasContentItem,
  ) => Promise<void>;
  setAuto: (connection: IliasConnection, courseRefId: string, auto: boolean) => Promise<void>;
  setFolderSynced: (
    connection: IliasConnection,
    courseRefId: string,
    folderRefId: string,
    synced: boolean,
  ) => Promise<void>;
  stop: (connection: IliasConnection, courseRefId: string) => Promise<void>;
  progress: (progress: CourseSyncProgress) => void;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  Reflect.deleteProperty(rest, key);
  return rest;
}

let due: Promise<void> | null = null;

export const useCourseFilesStore = create<CourseFilesState>()((set, get) => {
  /** Resets what was read when the installation changes. */
  function forInstallation(connection: IliasConnection) {
    const installation = hostOf(connection);
    if (get().installation !== installation) {
      set({ installation, folders: null, reports: {}, failures: {}, saving: {} });
    }
  }

  function keep(folder: CourseFolder) {
    set((state) => ({ folders: { ...(state.folders ?? {}), [folder.courseRefId]: folder } }));
  }

  function fail(courseRefId: string, cause: unknown) {
    const failure = asFailure(cause);
    set((state) => ({ failures: { ...state.failures, [courseRefId]: failure } }));
    // An ended sign-in is the whole page's news.
    if (failure.kind === 'session-expired') useCourseStore.setState({ failure });
  }

  async function run(connection: IliasConnection, course: IliasCourse, first: boolean) {
    const refId = course.refId;
    if (refId in get().syncing) return;
    set((state) => ({
      syncing: { ...state.syncing, [refId]: null },
      failures: without(state.failures, refId),
    }));
    try {
      const report = await withRenewal(connection, () =>
        syncCourseFiles(connection, courseTarget(course)),
      );
      set((state) => ({ reports: { ...state.reports, [refId]: report } }));
      keep(first ? await configureCourseFolder(connection, refId, { auto: true }) : report.summary);
    } catch (cause) {
      fail(refId, cause);
      // The folder may exist by now, even if the sync stopped halfway.
      await get().load(connection);
    } finally {
      set((state) => ({ syncing: without(state.syncing, refId) }));
    }
  }

  async function change(courseRefId: string, work: () => Promise<CourseFolder>) {
    try {
      keep(await work());
      set((state) => ({ failures: without(state.failures, courseRefId) }));
    } catch (cause) {
      fail(courseRefId, cause);
    }
  }

  return {
    installation: null,
    folders: null,
    syncing: {},
    reports: {},
    failures: {},
    saving: {},

    load: async (connection) => {
      forInstallation(connection);
      try {
        const folders = await listCourseFolders(connection);
        set({
          folders: Object.fromEntries(folders.map((folder) => [folder.courseRefId, folder])),
        });
      } catch {
        // Reading the workspace failed; what was known stays.
      }
    },

    sync: async (connection, course) => {
      forInstallation(connection);
      await run(connection, course, !get().folders?.[course.refId]);
    },

    syncDue: (connection, courses, now = new Date()) => {
      due ??= (async () => {
        try {
          forInstallation(connection);
          if (!get().folders) await get().load(connection);
          for (const folder of Object.values(get().folders ?? {})) {
            const course = courses.find((item) => item.refId === folder.courseRefId);
            const last = folder.syncedAt ? new Date(folder.syncedAt).getTime() : 0;
            if (!folder.auto || !course?.online || now.getTime() - last < AUTO_SYNC_MS) continue;
            if (useCourseStore.getState().failure?.kind === 'session-expired') return;
            await run(connection, course, false);
          }
        } finally {
          due = null;
        }
      })();
      return due;
    },

    saveFile: async (connection, course, trail, file) => {
      forInstallation(connection);
      if (get().saving[file.refId]?.state === 'saving') return;
      const note = (saving: FileSaving) =>
        set((state) => ({ saving: { ...state.saving, [file.refId]: saving } }));
      note({ state: 'saving' });
      try {
        const saved = await withRenewal(connection, () =>
          saveCourseFile(connection, courseTarget(course), trail, file),
        );
        note({ state: 'saved', file: saved });
        await get().load(connection);
      } catch (cause) {
        const failure = asFailure(cause);
        note({ state: 'failed', message: failure.message });
        if (failure.kind === 'session-expired') useCourseStore.setState({ failure });
      }
    },

    setAuto: (connection, courseRefId, auto) =>
      change(courseRefId, () => configureCourseFolder(connection, courseRefId, { auto })),

    setFolderSynced: (connection, courseRefId, folderRefId, synced) => {
      const excluded = get().folders?.[courseRefId]?.excluded ?? [];
      const next = synced
        ? excluded.filter((id) => id !== folderRefId)
        : [...new Set([...excluded, folderRefId])];
      return change(courseRefId, () =>
        configureCourseFolder(connection, courseRefId, { excluded: next }),
      );
    },

    stop: async (connection, courseRefId) => {
      try {
        await stopSyncingCourse(connection, courseRefId);
        set((state) => ({
          folders: state.folders ? without(state.folders, courseRefId) : null,
          reports: without(state.reports, courseRefId),
          failures: without(state.failures, courseRefId),
        }));
      } catch (cause) {
        fail(courseRefId, cause);
      }
    },

    progress: (progress) => {
      if (!(progress.courseRefId in get().syncing)) return;
      set((state) => ({ syncing: { ...state.syncing, [progress.courseRefId]: progress } }));
    },
  };
});

let listening: Promise<void> | null = null;

/** Starts hearing sync progress from Rust, once. Safe to call on every mount. */
export function listenToCourseFiles(): Promise<void> {
  listening ??= listenToCourseSync((progress) =>
    useCourseFilesStore.getState().progress(progress),
  ).then(
    () => undefined,
    (cause: unknown) => {
      listening = null;
      throw cause;
    },
  );
  return listening;
}

/** For tests: forget the listener and any automatic run in flight. */
export function resetCourseFilesListening(): void {
  listening = null;
  due = null;
}
