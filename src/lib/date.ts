/**
 * Calendar maths for the app.
 *
 * Everything stays in the user's own timezone. Date keys are built by hand
 * instead of via `toISOString()`, which shifts to UTC and silently reports the
 * wrong day for anyone east or west of Greenwich. Month and weekday names are
 * table driven rather than `toLocaleDateString`, so the rendered text is the
 * same in the app, in CI and in a Node build without full ICU data.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Monday first — the week shape used across the calendar. */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` in local time — the identity of a day throughout the app. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Inverse of {@link localDateKey}. Returns local midnight. */
export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local midnight `amount` days away. Crosses month, year and DST boundaries. */
export function addDays(date: Date, amount: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** 0 for Monday … 6 for Sunday. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Local midnight on the Monday of this date's week. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -weekdayIndex(date));
}

export function isSameDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

/** Whole days between two dates. Rounded, so a DST shift cannot bend the count. */
export function differenceInDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/** `'08:15'` → `495`, minutes since midnight. */
export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** `495` → `'08:15'`. Wraps, so arithmetic around midnight stays printable. */
export function formatClock(minutes: number): string {
  const inDay = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/** `690` → `'11h 30m'`, `60` → `'1h'`, `45` → `'45m'`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** `'8 – 14 September 2026'`, collapsing whatever the two ends share. */
export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = MONTH_NAMES[weekStart.getMonth()] ?? '';
  const endMonth = MONTH_NAMES[weekEnd.getMonth()] ?? '';

  if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
    return `${weekStart.getDate()} ${startMonth} ${weekStart.getFullYear()} – ${weekEnd.getDate()} ${endMonth} ${weekEnd.getFullYear()}`;
  }
  if (weekStart.getMonth() !== weekEnd.getMonth()) {
    return `${weekStart.getDate()} ${startMonth} – ${weekEnd.getDate()} ${endMonth} ${weekEnd.getFullYear()}`;
  }
  return `${weekStart.getDate()} – ${weekEnd.getDate()} ${startMonth} ${weekStart.getFullYear()}`;
}

/** `'Monday, 8 September 2026'`. */
export function formatDayLabel(date: Date): string {
  return `${WEEKDAY_NAMES[weekdayIndex(date)] ?? ''}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

/** `'Today'`, `'Tomorrow'`, `'Yesterday'` — or `null` when nothing shorter fits. */
export function relativeDayLabel(date: Date, today: Date): string | null {
  const offset = differenceInDays(date, today);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  return null;
}

/** How long ago something happened: `'just now'`, `'12 min ago'`, `'2 days ago'`. */
export function formatTimeAgo(date: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** `'This week'`, `'Next week'`, `'In 3 weeks'`, `'2 weeks ago'`. */
export function relativeWeekLabel(weekStart: Date, today: Date): string {
  const offset = Math.round(differenceInDays(weekStart, startOfWeek(today)) / 7);
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return offset > 0 ? `In ${offset} weeks` : `${Math.abs(offset)} weeks ago`;
}

/**
 * ISO-8601 week number — the "KW" German universities print on every timetable.
 * Week 1 is the one holding the first Thursday of the year, so the whole
 * calculation hangs off the Thursday of the week in question.
 */
export function isoWeekNumber(date: Date): number {
  const thursday = addDays(date, 3 - weekdayIndex(date));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round(differenceInDays(thursday, startOfWeek(firstThursday)) / 7);
}
