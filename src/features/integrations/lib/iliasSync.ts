/**
 * Reading ILIAS without opening it — the TypeScript side of
 * `src-tauri/src/ilias_sync/`.
 *
 * Rust asks ILIAS for its pages with the session the student signed in with
 * in ILIAS mode, and reads them there; the page only ever receives what came
 * out, never ILIAS markup. This module asks, and turns Rust's answer into an
 * `IliasError` the UI already knows how to explain.
 *
 * The shapes below are ILIAS's, not the read models in `types.ts`: which
 * fields a course view needs (an offline flag? the study area?) is for the
 * first view to decide. Map them there.
 *
 * Desktop only. A browser tab holds no ILIAS session to read with.
 */

import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { IliasError } from '@/features/integrations/lib/ilias/errors';

/** Dates are local time as ILIAS printed it: `2026-09-25` or `2026-09-25T10:12`. */
export interface IliasPeriod {
  start: string | null;
  end: string | null;
}

export interface IliasProperty {
  name: string;
  value: string;
}

export interface IliasCourse {
  refId: string;
  /** `crs` or `grp`. */
  providerType: string;
  title: string;
  description: string | null;
  /** The category ILIAS files it under, e.g. "H3 Labor für Softwareentwicklung 1". */
  area: string | null;
  /** False when ILIAS lists the course but will not open it ("Offline"). */
  online: boolean;
  period: IliasPeriod | null;
  properties: IliasProperty[];
}

export type IliasContainer = 'crs' | 'grp' | 'fold';

export interface IliasFileFacts {
  suffix: string | null;
  /** Bytes, from ILIAS's rounded size — close, not exact. */
  size: number | null;
  /** 1 until the file is replaced for the first time. */
  version: number;
  /** When the current version was uploaded. */
  updatedAt: string | null;
}

export interface IliasContentItem {
  refId: string;
  parentRefId: string | null;
  /** `fold`, `file`, `exc`, `webr`, … `other` when ILIAS did not say. */
  providerType: string;
  title: string;
  description: string | null;
  /** The item group it is listed under, e.g. "Part 1". */
  block: string | null;
  file: IliasFileFacts | null;
  properties: string[];
}

export interface IliasAssignment {
  assId: string;
  exerciseRefId: string;
  title: string;
  /** "Laufende", "Kommende" or "Vergangene", in the installation's language. */
  section: string | null;
  state: string | null;
  startsAt: string | null;
  dueAt: string | null;
  mandatory: boolean | null;
  /** The student's last submission; null when there is none. */
  submittedAt: string | null;
  grade: string | null;
  properties: IliasProperty[];
}

/**
 * A course whose files Uni Pilot keeps in the Documents workspace — the
 * `Summary` of `src-tauri/src/ilias_sync/mirror/`. Paths are relative to the
 * workspace, as the document explorer names them.
 */
export interface CourseFolder {
  courseRefId: string;
  courseTitle: string;
  /** The course's `ILIAS` folder, e.g. `Courses/Winter 2026-27/Datenbanken 1/ILIAS`. */
  root: string;
  /** Whether Uni Pilot syncs it on its own. */
  auto: boolean;
  /** ILIAS folders the student switched off, by ref_id. */
  excluded: string[];
  /** When the last complete sync ended, ISO 8601. */
  syncedAt: string | null;
  folders: { refId: string; title: string; path: string }[];
  /** The files Uni Pilot put there, by ILIAS ref_id. */
  files: Record<string, CourseFile>;
}

export interface CourseFile {
  path: string;
  /** `gone`: ILIAS no longer lists it, the copy stays. `removed`: the student deleted it. */
  state: 'synced' | 'gone' | 'removed';
  version: number;
}

/** What a sync did. */
export interface CourseSyncReport {
  summary: CourseFolder;
  added: string[];
  updated: string[];
  /** New versions saved beside a copy the student had changed. */
  kept: string[];
  /** Too large to download unasked; one click in Courses fetches them. */
  tooLarge: { refId: string; title: string; size: number | null }[];
  /** Files ILIAS stopped listing this time. */
  gone: number;
  failed: { title: string; message: string }[];
}

/** Where a running sync is, from the `ilias-mirror-progress` event. */
export interface CourseSyncProgress {
  courseRefId: string;
  phase: 'reading' | 'downloading' | 'done';
  done: number;
  total: number;
  title: string | null;
}

/** The course as the sync needs it: which one, and where its folder goes. */
export interface CourseTarget {
  refId: string;
  container: 'crs' | 'grp';
  /** The course folder's name, e.g. "Datenbanken 1". */
  title: string;
  /** The semester folder above it, e.g. "Winter 2026-27"; null for none. */
  semester: string | null;
}

/** `SyncError` in `src-tauri/src/ilias_sync/mod.rs`. */
type SyncFailure =
  | { kind: 'signedOut' }
  | { kind: 'refused' | 'unreachable' | 'unrecognised' | 'local'; message: string };

function isSyncFailure(value: unknown): value is SyncFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['signedOut', 'refused', 'unreachable', 'unrecognised', 'local'].includes(
      (value as { kind?: unknown }).kind as string,
    )
  );
}

/** What Rust answered, as the failure the rest of the app already handles. */
export function toIliasError(failure: unknown): IliasError {
  if (!isSyncFailure(failure)) {
    return new IliasError('provider-error', 'ILIAS could not be read.', String(failure));
  }
  switch (failure.kind) {
    case 'signedOut':
      return new IliasError(
        'session-expired',
        'The ILIAS sign-in has ended. Sign in to ILIAS again.',
      );
    case 'unreachable':
      return new IliasError(
        'network',
        'ILIAS could not be reached. Try again later.',
        failure.message,
      );
    case 'unrecognised':
      return new IliasError(
        'unreadable-response',
        'ILIAS showed a page Uni Pilot cannot read yet. It may have been updated.',
        failure.message,
      );
    case 'refused':
      return new IliasError(
        'provider-error',
        'Uni Pilot does not ask ILIAS for that.',
        failure.message,
      );
    case 'local':
      // Uni Pilot's own part on this computer: its words are the message.
      return new IliasError('provider-error', failure.message, failure.message);
  }
}

/**
 * Tauri's API, imported once for every call. A course page asks for the
 * course list and a folder at the same moment; two first imports at once gave
 * the test runner's module mock the slip, and one import is all a page needs.
 */
let tauri: Promise<typeof import('@tauri-apps/api/core')> | null = null;

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  try {
    return await invoke<T>(command, args);
  } catch (failure) {
    throw toIliasError(failure);
  }
}

function installation(connection: IliasConnection) {
  return { baseUrl: connection.baseUrl, clientId: connection.clientId };
}

/**
 * Tries for a new ILIAS session through the university's sign-on, in a hidden
 * window: while the sign-on still remembers the student, ILIAS lets them back
 * in without password or code. `false` when the student has to sign in.
 */
export function renewIliasSession(connection: IliasConnection): Promise<boolean> {
  return call('ilias_sync_reauth', installation(connection));
}

/**
 * Development builds only: Rust signs in to the university's sign-on with the
 * password and authenticator stored for this ILIAS, then lets ILIAS sign in
 * through it (`docs/face-unlock-plan.md`, Phase 2). The page names the ILIAS;
 * Rust picks the sign-on and reads the vault. `true` when ILIAS has a session
 * again. Rejects with Rust's `SignInError` — see `signInFailureText`.
 */
export async function testIliasSignIn(connection: IliasConnection): Promise<boolean> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  return invoke<boolean>('sign_in_to_ilias', installation(connection));
}

/** What the vault holds for an ILIAS — never the password or the authenticator. `Status` in `src-tauri/src/vault.rs`. */
export interface AutoSignInStatus {
  credentials: boolean;
  username: string | null;
  /** The name of Uni Pilot's authenticator at the university. */
  device: string | null;
  /** The university refused the stored password; saving again clears it. */
  stale: boolean;
  face: boolean;
}

export interface AutoSignInValues {
  username: string;
  password: string;
  /** An `otpauth://totp/…` link, or the bare secret. */
  authenticator: string;
  /** Empty for Rust's default, "Uni Pilot". */
  device: string;
}

/**
 * Stores what the automatic sign-in needs for this ILIAS, replacing what was
 * there, in the platform's credential store under the ILIAS host —
 * `testIliasSignIn` reads the same entry. Rust checks the values; the answer
 * never carries the password or the authenticator back. Rejects with Rust's
 * `VaultError` — see `vaultFailureText`.
 */
export async function saveIliasSignIn(
  connection: IliasConnection,
  values: AutoSignInValues,
): Promise<AutoSignInStatus> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  return invoke<AutoSignInStatus>('auto_sign_in_save', {
    baseUrl: connection.baseUrl,
    username: values.username,
    password: values.password,
    authenticator: values.authenticator,
    device: values.device.trim() || null,
  });
}

/** What a failed save says, from `VaultError` in `src-tauri/src/vault.rs`. Its messages never repeat the input. */
export function vaultFailureText(failure: unknown): string {
  const { kind, message } =
    typeof failure === 'object' && failure !== null
      ? (failure as { kind?: unknown; message?: unknown })
      : {};
  if (kind === 'refused') return 'Access to the credential store was declined.';
  return typeof message === 'string' ? message : 'The sign-in could not be stored.';
}

/** What a failed automatic sign-in says, from `SignInError` in `src-tauri/src/ilias_sync/sign_in/`. */
export function signInFailureText(failure: unknown): string {
  const { kind, message } =
    typeof failure === 'object' && failure !== null
      ? (failure as { kind?: unknown; message?: unknown })
      : {};
  switch (kind) {
    case 'notSetUp':
      return 'No sign-in is stored for this ILIAS.';
    case 'wrongPassword':
      return 'The stored password was refused. Save it again before the next try.';
    case 'wrongCode':
      return 'The code from Uni Pilot’s authenticator was refused.';
  }
  return typeof message === 'string' ? message : 'The sign-in did not work.';
}

/** The student's courses and groups, offline ones included. */
export function readIliasCourses(connection: IliasConnection): Promise<IliasCourse[]> {
  return call('ilias_sync_courses', installation(connection));
}

/** What a course, group or folder holds. Files are described, never downloaded. */
export function readIliasContents(
  connection: IliasConnection,
  container: IliasContainer,
  containerRefId: string,
): Promise<IliasContentItem[]> {
  return call('ilias_sync_contents', { ...installation(connection), container, containerRefId });
}

/** An exercise's assignments, past ones included. */
export function readIliasAssignments(
  connection: IliasConnection,
  exerciseRefId: string,
): Promise<IliasAssignment[]> {
  return call('ilias_sync_assignments', { ...installation(connection), exerciseRefId });
}

/** The courses whose files this computer keeps, for this installation. */
export function listCourseFolders(connection: IliasConnection): Promise<CourseFolder[]> {
  return call('ilias_mirror_list', { baseUrl: connection.baseUrl });
}

/**
 * Brings a course's `ILIAS` folder up to date — creating it the first time.
 * Downloads count as reading the files in ILIAS, as a click there would, so
 * this runs only for courses the student chose.
 */
export function syncCourseFiles(
  connection: IliasConnection,
  course: CourseTarget,
): Promise<CourseSyncReport> {
  return call('ilias_mirror_course', { ...installation(connection), course });
}

/**
 * Saves one file the student clicked into the course's `ILIAS` folder, where
 * the sync would put it. `trail` is the folders it sits in, outermost first.
 */
export function saveCourseFile(
  connection: IliasConnection,
  course: CourseTarget,
  trail: { refId: string; title: string }[],
  file: IliasContentItem,
): Promise<CourseFile> {
  return call('ilias_mirror_file', {
    ...installation(connection),
    course,
    trail,
    file: {
      refId: file.refId,
      title: file.title,
      suffix: file.file?.suffix ?? null,
      size: file.file?.size ?? null,
      version: file.file?.version ?? 1,
      updatedAt: file.file?.updatedAt ?? null,
    },
  });
}

/** Switches automatic syncing, or which ILIAS folders are left out. */
export function configureCourseFolder(
  connection: IliasConnection,
  courseRefId: string,
  change: { auto?: boolean; excluded?: string[] },
): Promise<CourseFolder> {
  return call('ilias_mirror_configure', {
    baseUrl: connection.baseUrl,
    courseRefId,
    auto: change.auto ?? null,
    excluded: change.excluded ?? null,
  });
}

/** Stops syncing a course. Its folder and files stay, as ordinary documents. */
export function stopSyncingCourse(connection: IliasConnection, courseRefId: string): Promise<void> {
  return call('ilias_mirror_detach', { baseUrl: connection.baseUrl, courseRefId });
}

/** Hears how far running syncs are. Resolves to a function that stops listening. */
export async function listenToCourseSync(
  onProgress: (progress: CourseSyncProgress) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<CourseSyncProgress>('ilias-mirror-progress', (event) => onProgress(event.payload));
}
