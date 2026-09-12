import {
  differenceInDays,
  localDateKey,
  minutesOfDay,
  MONTH_NAMES,
  parseDateKey,
} from '@/lib/date';
import type { EventTone } from '@/lib/tone';
import { toneFor } from './icsMapping';
import type { CalendarEvent } from './types';

export type TaskPriority = 'high' | 'med' | 'low';

export interface StudyTask {
  id: string;
  title: string;
  /** Local `YYYY-MM-DD`. A real date, which is what makes sorting possible. */
  dueDate: string;
  /** `HH:MM`, or null when the day is all the precision there is. */
  dueTime: string | null;
  priority: TaskPriority;
  /** Ties the task to a course, and with it to the colour used on the grid. */
  courseCode: string | null;
  done: boolean;
}

/** Tasks get ticked off. Everything else happens to you whether you tick it or not. */
export type AgendaSource = 'task' | 'exam' | 'deadline';

export interface AgendaEntry {
  id: string;
  title: string;
  source: AgendaSource;
  dueDate: string;
  dueTime: string | null;
  done: boolean;
  /** Only tasks carry one; a timetable has no opinion about your priorities. */
  priority: TaskPriority | null;
  courseCode: string | null;
  room: string | null;
  tone: EventTone;
}

export type AgendaBucketId = 'overdue' | 'today' | 'soon' | 'later' | 'done';

export interface AgendaBucket {
  id: AgendaBucketId;
  label: string;
  entries: AgendaEntry[];
}

const BUCKET_LABELS: Record<AgendaBucketId, string> = {
  overdue: 'Overdue',
  today: 'Today',
  soon: 'Next 7 days',
  later: 'Later',
  done: 'Done',
};

const BUCKET_ORDER: readonly AgendaBucketId[] = ['overdue', 'today', 'soon', 'later', 'done'];

const SOON_DAYS = 7;
/** Sorts an undated deadline behind everything that names a time that day. */
const END_OF_DAY = 24 * 60;

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High priority',
  med: 'Medium priority',
  low: 'Low priority',
};

function taskToEntry(task: StudyTask): AgendaEntry {
  return {
    id: task.id,
    title: task.title,
    source: 'task',
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    done: task.done,
    priority: task.priority,
    courseCode: task.courseCode,
    room: null,
    // Same hash the grid uses, so a task inherits its course's colour.
    tone: task.courseCode ? toneFor(task.courseCode, 'lecture') : 'accent',
  };
}

function eventToEntry(event: CalendarEvent): AgendaEntry {
  return {
    id: event.id,
    title: event.title,
    source: event.kind === 'exam' ? 'exam' : 'deadline',
    dueDate: event.date,
    dueTime: event.allDay ? null : event.startTime,
    done: false,
    priority: null,
    courseCode: event.courseCode ?? null,
    room: event.room ?? null,
    tone: event.tone,
  };
}

function sortKey(entry: AgendaEntry): number {
  const day = parseDateKey(entry.dueDate).getTime();
  return day + (entry.dueTime ? minutesOfDay(entry.dueTime) : END_OF_DAY) * 60_000;
}

function bucketFor(entry: AgendaEntry, today: Date): AgendaBucketId {
  if (entry.done) return 'done';

  const days = differenceInDays(parseDateKey(entry.dueDate), today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= SOON_DAYS ? 'soon' : 'later';
}

/**
 * Merges your tasks with the dated things the timetable brings, then groups
 * them by how soon they are.
 *
 * Grouping by deadline rather than by priority is deliberate: the deadline is
 * a fact and the priority is an opinion, so a high-priority task three weeks
 * out must not outrank tomorrow's hand-in. Priority survives as a marker on
 * the row.
 *
 * Exams and deadlines that have already happened are dropped rather than piled
 * into "Overdue". You cannot act on last month's exam; an unfinished task of
 * your own is a different matter and stays.
 */
export function buildAgenda(
  tasks: readonly StudyTask[],
  events: readonly CalendarEvent[],
  now: Date,
): AgendaBucket[] {
  const todayKey = localDateKey(now);

  const fromTimetable = events
    .filter((event) => event.kind === 'exam' || event.kind === 'deadline')
    .filter((event) => event.status !== 'cancelled' && event.date >= todayKey)
    .map(eventToEntry);

  const entries = [...tasks.map(taskToEntry), ...fromTimetable].sort(
    (a, b) => sortKey(a) - sortKey(b),
  );

  const grouped = new Map<AgendaBucketId, AgendaEntry[]>();
  for (const entry of entries) {
    const id = bucketFor(entry, now);
    grouped.set(id, [...(grouped.get(id) ?? []), entry]);
  }

  return BUCKET_ORDER.filter((id) => grouped.get(id)?.length).map((id) => ({
    id,
    label: BUCKET_LABELS[id],
    entries: grouped.get(id) ?? [],
  }));
}

/** Why a day is worth marking in the mini month. Exams outrank the rest. */
export type DayMarker = 'exam' | 'due';

export const DAY_MARKER_LABELS: Record<DayMarker, string> = {
  exam: 'exam',
  due: 'something due',
};

/**
 * The days that earn a dot in the mini month.
 *
 * Marking every day that holds anything is the same as marking nothing: a
 * semester timetable fills every weekday, so the dots turn into a picture of
 * the working week. Only things with a deadline count, which is what someone
 * scans a month for.
 */
export function markedDays(
  tasks: readonly StudyTask[],
  events: readonly CalendarEvent[],
): Map<string, DayMarker> {
  const marks = new Map<string, DayMarker>();

  const mark = (date: string, marker: DayMarker) => {
    // An exam already on a day is never downgraded by a task beside it.
    if (marker === 'exam' || !marks.has(date)) marks.set(date, marker);
  };

  for (const event of events) {
    if (event.status === 'cancelled') continue;
    if (event.kind === 'exam') mark(event.date, 'exam');
    else if (event.kind === 'deadline') mark(event.date, 'due');
  }

  for (const task of tasks) {
    if (!task.done) mark(task.dueDate, 'due');
  }

  return marks;
}

/** "Today, 23:59", "In 4 days", "12 Oct" once relative wording stops helping. */
export function formatDue(entry: AgendaEntry, now: Date): string {
  const due = parseDateKey(entry.dueDate);
  const days = differenceInDays(due, now);

  let day: string;
  if (days === 0) day = 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days === -1) day = 'Yesterday';
  else if (days > 1 && days <= SOON_DAYS) day = `In ${days} days`;
  else if (days < -1 && days >= -SOON_DAYS) day = `${Math.abs(days)} days ago`;
  else day = `${due.getDate()} ${(MONTH_NAMES[due.getMonth()] ?? '').slice(0, 3)}`;

  return entry.dueTime ? `${day}, ${entry.dueTime}` : day;
}
