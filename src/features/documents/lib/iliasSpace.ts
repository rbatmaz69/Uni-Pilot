import { splitCourseTitle } from '@/features/courses/lib/courses';
import type { DocumentEntry, IliasCourse, IliasFile } from '@/features/documents/lib/files';
import { COURSES_SPACE, ILIAS_SPACE } from '@/features/documents/lib/spaces';
import type {
  CourseFolder,
  IliasCourse as ListedCourse,
} from '@/features/integrations/lib/iliasSync';

export type IliasFileRow = IliasFile & { course: IliasCourse };

/** A course opened in the ILIAS space: the course, a folder in it, or an exercise. */
export interface IliasCourseView {
  courseId: string;
  /** Folders opened below the course, outermost first. */
  trail: string[];
  exerciseId: string | null;
}

/**
 * Whether a path runs through a folder the sync owns. The sync always names
 * it `ILIAS`; this answers before the listing does, so a linked course folder
 * never flashes up on the canvas first.
 */
export function looksSynced(path: string): boolean {
  return /(^|\/)ILIAS(\/|$)/.test(path);
}

/**
 * When a file came onto ILIAS, in milliseconds. ILIAS's own date comes first:
 * a course's first sync brings every file in the same minute, so the arrival
 * time only stands in when ILIAS gave none.
 */
export function addedAt(file: IliasFile): number {
  const time = file.updatedAt ? new Date(file.updatedAt).getTime() : Number.NaN;
  return Number.isNaN(time) ? file.arrived : time;
}

/** The files of every course, newest first. */
export function newestFiles(courses: IliasCourse[]): IliasFileRow[] {
  return courses
    .flatMap((course) => course.files.map((file) => ({ ...file, course })))
    .sort(
      (a, b) =>
        addedAt(b) - addedAt(a) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
}

/** The course folder's name, the student's one: without module number and semester. */
export function courseName(course: IliasCourse): string {
  return course.root.split('/').at(-2) ?? course.title;
}

/** The folder the course folder sits in — its semester, usually — unless that is the top. */
export function courseParent(course: IliasCourse): string | null {
  const parent = course.root.split('/').at(-3);
  return parent && parent !== COURSES_SPACE ? parent : null;
}

/** Whether a folder or file belongs to the ILIAS space: the space itself or a synced folder. */
export function inIliasSpace(path: string, courses: IliasCourse[]): boolean {
  return (
    path === ILIAS_SPACE ||
    courses.some((course) => path === course.root || path.startsWith(`${course.root}/`))
  );
}

/** A synced file as the explorer opens it. */
export function iliasEntry(file: IliasFile): DocumentEntry {
  return {
    name: file.name,
    path: file.path,
    folder: false,
    size: file.size,
    modified: file.arrived,
    ilias: file.gone ? 'gone' : 'file',
    ...(file.unseen ? { unseen: 1 } : {}),
  };
}

/** What a course dragged out of the ILIAS space carries: its ref_id. */
export const COURSE_DRAG = 'application/x-uni-pilot-course';

/** A course in the ILIAS space: as ILIAS lists it, and its files if Documents keeps them. */
export interface CourseCard {
  refId: string;
  /** ILIAS's full title. */
  title: string;
  /** The module number ILIAS puts in front, if any. */
  code: string | null;
  name: string;
  /** Its files in Documents, once the course syncs. */
  synced: IliasCourse | null;
}

function card(refId: string, title: string, synced: IliasCourse | null): CourseCard {
  const { code, name } = splitCourseTitle(title);
  return { refId, title, code, name, synced };
}

/**
 * Every course ILIAS opens for the student, and every course Documents keeps —
 * also one ILIAS has since taken offline. Kept ones first, then by name.
 */
export function courseCards(listed: ListedCourse[], synced: IliasCourse[]): CourseCard[] {
  const kept = new Map(synced.map((course) => [course.courseRefId, course]));
  const cards = listed
    .filter((course) => course.online || kept.has(course.refId))
    .map((course) => card(course.refId, course.title, kept.get(course.refId) ?? null));
  for (const course of synced)
    if (!listed.some((item) => item.refId === course.courseRefId))
      cards.push(card(course.courseRefId, course.title, course));
  return cards.sort(
    (a, b) =>
      Number(!!b.synced) - Number(!!a.synced) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/**
 * The courses Documents keeps: as read from their folders, and any the sync
 * reports before those are read again — a course just added, say.
 */
export function keptCourses(read: IliasCourse[], folders: Record<string, CourseFolder> | null) {
  const extra = Object.values(folders ?? {})
    .filter((folder) => !read.some((course) => course.courseRefId === folder.courseRefId))
    .map((folder): IliasCourse => ({
      courseRefId: folder.courseRefId,
      title: folder.courseTitle,
      root: folder.root,
      syncedAt: folder.syncedAt,
      unseen: 0,
      files: [],
    }));
  return [...read, ...extra];
}

/** Courses ILIAS keeps closed right now and Documents does not keep. */
export function offlineCourses(listed: ListedCourse[], synced: IliasCourse[]): ListedCourse[] {
  return listed.filter(
    (course) => !course.online && !synced.some((item) => item.courseRefId === course.refId),
  );
}

/** The folder whose papers peek out of a course's folder: where its newest file lies. */
export function peekFolder(course: IliasCourse): string {
  const newest = newestFiles([course])[0];
  return newest ? newest.path.split('/').slice(0, -1).join('/') : course.root;
}
