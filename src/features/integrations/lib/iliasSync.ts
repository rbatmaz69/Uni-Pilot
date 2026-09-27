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

/** A file saved to Downloads; opened or shown by `id` through `iliasBrowser.ts`. */
export interface IliasSavedFile {
  id: number;
  /** The name it was saved under — possibly numbered, `Blatt (1).pdf`. */
  fileName: string;
  /** Whether Uni Pilot opens it with its default app: documents and media. */
  openable: boolean;
}

/** `SyncError` in `src-tauri/src/ilias_sync/mod.rs`. */
type SyncFailure =
  { kind: 'signedOut' } | { kind: 'refused' | 'unreachable' | 'unrecognised'; message: string };

function isSyncFailure(value: unknown): value is SyncFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['signedOut', 'refused', 'unreachable', 'unrecognised'].includes(
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

/**
 * Saves a file to Downloads. Only on the student's click: ILIAS counts a
 * download as reading the file, as it would a click in ILIAS itself.
 */
export function downloadIliasFile(
  connection: IliasConnection,
  fileRefId: string,
): Promise<IliasSavedFile> {
  return call('ilias_sync_download', { ...installation(connection), fileRefId });
}
