import { formatClock, localDateKey, minutesOfDay } from '@/lib/date';
import type { IcsCalendar, IcsEvent } from '@/lib/ics';
import type { EventTone } from '@/lib/tone';
import type { CalendarEvent, CalendarEventKind, CalendarEventStatus } from './types';

/**
 * Feeds carry no colours, so one is derived from the course instead. Coral is
 * held back for exams, which is the one thing worth spotting from across the
 * grid.
 */
const ROTATION: readonly EventTone[] = [
  'blue',
  'green',
  'yellow',
  'lavender',
  'teal',
  'pink',
  'orange',
  'accent',
];

/**
 * German first, because that is what a Heilbronn timetable exports. Order
 * matters: a "Klausurübung" is revision for an exam, not an exam.
 */
const KIND_PATTERNS: readonly [RegExp, CalendarEventKind][] = [
  [/(abgabe|deadline|hand[-\s]?in|frist|due\b)/i, 'deadline'],
  [/(klausur|pr[üu]fung|\bexam\b|examination)/i, 'exam'],
  [/(labor|praktikum|\blab\b|workshop)/i, 'lab'],
  [/(tutorium|tutorial|seminar|[üu]bung|exercise)/i, 'seminar'],
  [/(vorlesung|lecture|\bvl\b)/i, 'lecture'],
];

const COURSE_CODE = /\b([A-Z]{2,5}[-\s]?\d{2,4}[A-Z]?)\b/;
/** The module number German campus systems append: `AKSE (262164)`. */
const MODULE_NUMBER = /\((\d{4,8})\)\s*$/;
const LAST_MINUTE = 23 * 60 + 59;
/**
 * Campus systems fill LOCATION with a placeholder when no room is assigned
 * yet. Showing "--" on a card is worse than showing nothing.
 */
const NO_ROOM = /^(-+|\?+|n\.?\s?n\.?|tba|tbd|k\.?\s?a\.?|offen)$/i;

export function cleanRoom(location: string | null): string | null {
  const trimmed = location?.trim() ?? '';
  return !trimmed || NO_ROOM.test(trimmed) ? null : trimmed;
}

/**
 * `title` is passed separately because a feed's SUMMARY is often an
 * abbreviation: "Projektlabor" only appears in the fuller name.
 */
export function inferKind(event: IcsEvent, title: string): CalendarEventKind {
  const haystack = `${event.summary} ${title} ${event.categories.join(' ')}`;
  for (const [pattern, kind] of KIND_PATTERNS) {
    if (pattern.test(haystack)) return kind;
  }
  return event.allDay ? 'personal' : 'lecture';
}

/** Stable across reloads: the same course keeps the same colour every sync. */
export function toneFor(key: string, kind: CalendarEventKind): EventTone {
  if (kind === 'exam') return 'coral';

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return ROTATION[Math.abs(hash) % ROTATION.length] ?? 'blue';
}

export function extractCourseCode(event: IcsEvent): string | null {
  const moduleNumber = MODULE_NUMBER.exec(event.summary);
  if (moduleNumber?.[1]) return moduleNumber[1];

  const fromCategory = event.categories.find((entry) => COURSE_CODE.test(entry));
  const match = COURSE_CODE.exec(fromCategory ?? event.summary);
  return match?.[1]?.replace(/\s/g, '-') ?? null;
}

export interface EntryDetails {
  title: string;
  instructor: string | null;
  note: string | null;
}

/**
 * Pulls a readable title and a lecturer out of one entry.
 *
 * German campus systems (StarPlan and its relatives) put an abbreviation in
 * SUMMARY and the useful version in DESCRIPTION: full course name on the first
 * line, teaching staff on the second, study group after that. The richer title
 * is only trusted when both carry the same module number, so a feed shaped any
 * other way falls back to its summary and keeps the description as a note.
 */
export function describeEntry(event: IcsEvent, courseCode: string | null): EntryDetails {
  const summaryTitle = event.summary.replace(MODULE_NUMBER, '').trim() || event.summary;
  const lines = (event.description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const [first, second, ...rest] = lines;
  const sameCourse = Boolean(courseCode && first?.includes(courseCode));

  if (!sameCourse) {
    return {
      title: summaryTitle,
      instructor: null,
      note: event.description,
    };
  }

  const fullTitle = (first ?? '').replace(MODULE_NUMBER, '').trim();
  return {
    title: fullTitle.length > summaryTitle.length ? fullTitle : summaryTitle,
    instructor: second ?? null,
    note: rest.join(' · ') || null,
  };
}

const STATUS: Record<string, CalendarEventStatus> = {
  CANCELLED: 'cancelled',
  TENTATIVE: 'tentative',
  CONFIRMED: 'confirmed',
};

/**
 * Turns a parsed feed into the shape the grid draws.
 *
 * An entry running past midnight is clipped to the end of its first day: the
 * week grid places events on one day, and a lecture that appears to run until
 * 02:00 is a worse lie than one that ends at 23:59.
 */
export function toCalendarEvents(calendar: IcsCalendar, sourceId: string): CalendarEvent[] {
  return calendar.events.map((entry) => {
    const courseCode = extractCourseCode(entry);
    const details = describeEntry(entry, courseCode);
    const kind = inferKind(entry, details.title);
    const room = cleanRoom(entry.location);
    const startMinute = entry.start.getHours() * 60 + entry.start.getMinutes();
    const sameDay = localDateKey(entry.start) === localDateKey(entry.end);
    const endMinute = sameDay ? entry.end.getHours() * 60 + entry.end.getMinutes() : LAST_MINUTE;

    const event: CalendarEvent = {
      id: `${sourceId}:${entry.uid}`,
      sourceId,
      title: details.title,
      kind,
      tone: toneFor(courseCode ?? details.title, kind),
      date: localDateKey(entry.start),
      startTime: formatClock(startMinute),
      endTime: formatClock(Math.max(endMinute, startMinute)),
      status: STATUS[entry.status ?? ''] ?? 'confirmed',
      ...(entry.allDay ? { allDay: true } : {}),
      ...(courseCode ? { courseCode } : {}),
      ...(room ? { room } : {}),
      ...(details.instructor ? { instructor: details.instructor } : {}),
      ...(details.note ? { note: details.note } : {}),
    };

    // An all-day entry has no meaningful clock, so the pinned row shows the
    // end of the day rather than a misleading 00:00.
    return entry.allDay
      ? { ...event, startTime: formatClock(LAST_MINUTE), endTime: formatClock(LAST_MINUTE) }
      : event;
  });
}

/** Deduplicates by id, keeping the entry a later source contributed. */
export function mergeEvents(...groups: readonly CalendarEvent[][]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();
  for (const group of groups) {
    for (const event of group) byId.set(event.id, event);
  }
  return [...byId.values()];
}

/** Total minutes an imported feed covers, used for the "looks right?" summary. */
export function countBusyMinutes(events: readonly CalendarEvent[]): number {
  return events
    .filter((event) => !event.allDay)
    .reduce(
      (total, event) => total + minutesOfDay(event.endTime) - minutesOfDay(event.startTime),
      0,
    );
}
