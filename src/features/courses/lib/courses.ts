/**
 * What the Courses page makes of ILIAS: grouping, labels, formatting.
 *
 * Pure, so it is tested without React or Tauri. The shapes come from
 * `iliasSync.ts`, which gets them from Rust; nothing here has seen HTML.
 *
 * Dates arrive as ILIAS printed them, in the installation's local time and
 * without an offset (`2025-09-15T08:41`). They are shown as they are — a
 * student in Heilbronn reads a Heilbronn deadline.
 */

import { MONTH_NAMES, startOfDay } from '@/lib/date';
import type {
  IliasContainer,
  IliasContentItem,
  IliasCourse,
} from '@/features/integrations/lib/iliasSync';

export interface CourseArea {
  name: string;
  courses: IliasCourse[];
}

/**
 * Courses the student can open, by the study area ILIAS files them under and
 * in ILIAS's order; offline ones apart, since a click could only fail.
 */
export function groupCourses(courses: readonly IliasCourse[]): {
  areas: CourseArea[];
  offline: IliasCourse[];
} {
  const areas: CourseArea[] = [];
  const offline: IliasCourse[] = [];
  for (const course of courses) {
    if (!course.online) {
      offline.push(course);
      continue;
    }
    const name = course.area ?? 'Other courses';
    const area = areas.find((known) => known.name === name);
    if (area) area.courses.push(course);
    else areas.push({ name, courses: [course] });
  }
  return { areas, offline };
}

/**
 * HHN titles start with the module number: `262058 Datenbanken 1 - WS25`,
 * `261835/262135 Praktisches Studiensemester …`. Shown apart, the name reads
 * first and the number stays findable.
 */
export function splitCourseTitle(title: string): { code: string | null; name: string } {
  const match = /^(\d{5,6}(?:\/\d{5,6})*)\s+(\S.*)$/.exec(title.trim());
  return match ? { code: match[1] ?? null, name: match[2] ?? title } : { code: null, name: title };
}

export interface ContentBlock {
  /** "Part 1", or ILIAS's generic "Inhalt" for a container without item groups. */
  title: string | null;
  items: IliasContentItem[];
}

/** Items in ILIAS's order, under the block each is listed in. */
export function groupByBlock(items: readonly IliasContentItem[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (last && last.title === item.block) last.items.push(item);
    else blocks.push({ title: item.block, items: [item] });
  }
  return blocks;
}

export type ItemKind = 'folder' | 'file' | 'exercise' | 'link' | 'other';

/** What a row is, for its icon and for what a click on it does. */
export function itemKind(providerType: string): ItemKind {
  switch (providerType) {
    case 'fold':
    case 'grp':
    case 'crs':
      return 'folder';
    case 'file':
      return 'file';
    case 'exc':
      return 'exercise';
    case 'webr':
      return 'link';
    default:
      return 'other';
  }
}

/** The containers Uni Pilot reads the contents of itself. */
export function containerFor(providerType: string): IliasContainer | null {
  return providerType === 'crs' || providerType === 'grp' || providerType === 'fold'
    ? providerType
    : null;
}

/** The `goto.php` shorthand ILIAS mode opens, e.g. `file_967852`. */
export function iliasTarget(providerType: string, refId: string): string {
  return `${providerType}_${refId}`;
}

/** `51087` → `49.9 KB`. ILIAS rounded the size already; one decimal is plenty. */
export function formatSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 100 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** `2025-09-15T08:41` as a local date, or null for anything else. */
export function parseIliasDate(value: string | null): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value) : null;
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2025-09-15T08:41` → `15 Sep 2025, 08:41`; a bare date stays a date. */
export function formatIliasDate(value: string | null): string | null {
  const date = parseIliasDate(value);
  if (!date || !value) return null;
  const month = (MONTH_NAMES[date.getMonth()] ?? '').slice(0, 3);
  const day = `${date.getDate()} ${month} ${date.getFullYear()}`;
  return value.includes('T') ? `${day}, ${value.slice(11, 16)}` : day;
}

/** Where a deadline stands: `Ended`, `Due today`, `Due tomorrow`, `Due in 3 days`. */
export function dueLabel(dueAt: string | null, now: Date): string | null {
  const due = parseIliasDate(dueAt);
  if (!due) return null;
  if (due.getTime() < now.getTime()) return 'Ended';
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
