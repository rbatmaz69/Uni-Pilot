/**
 * What Uni Pilot last read from ILIAS.
 *
 * Kept, so the Courses page opens with something before ILIAS answers, and
 * still shows it once the sign-in has run out — ILIAS forgets its session when
 * Uni Pilot quits, and signing in again takes an authenticator code. Course
 * titles and file names only; nothing secret goes in here, the same rule as
 * `iliasStore`.
 *
 * The cache belongs to one installation. Connecting another ILIAS starts
 * empty rather than showing the old one's courses.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { IliasError, type IliasFailureKind } from '@/features/integrations/lib/ilias/errors';
import {
  downloadIliasFile,
  renewIliasSession,
  readIliasAssignments,
  readIliasContents,
  readIliasCourses,
  type IliasAssignment,
  type IliasContainer,
  type IliasContentItem,
  type IliasCourse,
  type IliasSavedFile,
} from '@/features/integrations/lib/iliasSync';

export interface Loaded<T> {
  items: T[];
  /** ISO 8601, when ILIAS was last read for these. */
  loadedAt: string;
}

export interface CourseFailure {
  kind: IliasFailureKind;
  message: string;
}

/** Where a file the student asked for stands. */
export type FileDownload =
  | { state: 'downloading' }
  | ({ state: 'saved' } & IliasSavedFile)
  | { state: 'failed'; message: string };

interface CourseState {
  /** The host the cache below was read from. */
  installation: string | null;
  courses: Loaded<IliasCourse> | null;
  /** By the ref_id of the course, group or folder. */
  contents: Record<string, Loaded<IliasContentItem>>;
  /** By the ref_id of the exercise. */
  assignments: Record<string, Loaded<IliasAssignment>>;
  /** Why the latest request gave nothing; cleared by the next that works. */
  failure: CourseFailure | null;
  /** Requests in flight, by `courses`, `contents:<id>`, `assignments:<id>`. */
  loading: Record<string, boolean>;
  /**
   * Files asked for this session, by ref_id. Not kept: the ids Rust opens
   * them by last only as long as Uni Pilot runs.
   */
  downloads: Record<string, FileDownload>;

  loadCourses: (connection: IliasConnection) => Promise<void>;
  loadContents: (
    connection: IliasConnection,
    container: IliasContainer,
    refId: string,
  ) => Promise<void>;
  loadAssignments: (connection: IliasConnection, exerciseRefId: string) => Promise<void>;
  /** Saves a file to Downloads. Only on the student's click; see `downloadIliasFile`. */
  download: (connection: IliasConnection, fileRefId: string) => Promise<void>;
}

function hostOf(connection: IliasConnection): string {
  try {
    return new URL(connection.baseUrl).host;
  } catch {
    return connection.baseUrl;
  }
}

function asFailure(cause: unknown): CourseFailure {
  return cause instanceof IliasError
    ? { kind: cause.kind, message: cause.message }
    : { kind: 'provider-error', message: 'ILIAS could not be read.' };
}

const EMPTY = { courses: null, contents: {}, assignments: {} };

/**
 * Runs `work`; when ILIAS says the session has ended, asks the sign-on for a
 * new one once — no password, no code — and runs it again. Only when that
 * fails does the student hear "sign in".
 */
async function withRenewal<T>(connection: IliasConnection, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (!(cause instanceof IliasError) || cause.kind !== 'session-expired') throw cause;
    const renewed = await renewIliasSession(connection).catch(() => false);
    if (!renewed) throw cause;
    return work();
  }
}

export const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => {
      /**
       * One request per key at a time. On success the result replaces the
       * cached one; on failure the cache stays and the failure is noted.
       */
      async function load<T>(
        connection: IliasConnection,
        key: string,
        read: () => Promise<T>,
        keep: (result: T, loadedAt: string) => Partial<CourseState>,
      ) {
        const installation = hostOf(connection);
        if (get().installation !== installation) set({ ...EMPTY, installation });
        if (get().loading[key]) return;

        set((state) => ({ loading: { ...state.loading, [key]: true } }));
        try {
          const result = await withRenewal(connection, read);
          set({ ...keep(result, new Date().toISOString()), failure: null });
        } catch (cause) {
          set({ failure: asFailure(cause) });
        } finally {
          set((state) => ({ loading: { ...state.loading, [key]: false } }));
        }
      }

      return {
        installation: null,
        ...EMPTY,
        failure: null,
        loading: {},
        downloads: {},

        loadCourses: (connection) =>
          load(
            connection,
            'courses',
            () => readIliasCourses(connection),
            (items, loadedAt) => ({ courses: { items, loadedAt } }),
          ),

        loadContents: (connection, container, refId) =>
          load(
            connection,
            `contents:${refId}`,
            () => readIliasContents(connection, container, refId),
            (items, loadedAt) => ({
              contents: { ...get().contents, [refId]: { items, loadedAt } },
            }),
          ),

        loadAssignments: (connection, exerciseRefId) =>
          load(
            connection,
            `assignments:${exerciseRefId}`,
            () => readIliasAssignments(connection, exerciseRefId),
            (items, loadedAt) => ({
              assignments: { ...get().assignments, [exerciseRefId]: { items, loadedAt } },
            }),
          ),

        download: async (connection, fileRefId) => {
          if (get().downloads[fileRefId]?.state === 'downloading') return;
          const note = (download: FileDownload) =>
            set((state) => ({ downloads: { ...state.downloads, [fileRefId]: download } }));

          note({ state: 'downloading' });
          try {
            const saved = await withRenewal(connection, () =>
              downloadIliasFile(connection, fileRefId),
            );
            note({ state: 'saved', ...saved });
          } catch (cause) {
            const failure = asFailure(cause);
            note({ state: 'failed', message: failure.message });
            // An ended sign-in is the whole page's news, not just this file's.
            if (failure.kind === 'session-expired') set({ failure });
          }
        },
      };
    },
    {
      name: 'uni-pilot.courses',
      version: 1,
      partialize: (state) => ({
        installation: state.installation,
        courses: state.courses,
        contents: state.contents,
        assignments: state.assignments,
      }),
    },
  ),
);
