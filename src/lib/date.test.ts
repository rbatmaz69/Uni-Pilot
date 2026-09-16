import { describe, expect, it } from 'vitest';
import {
  addDays,
  differenceInDays,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatTimeAgo,
  formatWeekRange,
  isSameDay,
  isoWeekNumber,
  localDateKey,
  minutesOfDay,
  parseDateKey,
  relativeDayLabel,
  relativeWeekLabel,
  startOfWeek,
  weekdayIndex,
} from './date';

/** 2026-09-11 is a Friday — a mid-week anchor that exercises both directions. */
const friday = new Date(2026, 8, 11);

describe('date keys', () => {
  it('writes a padded local key', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips through parseDateKey', () => {
    expect(localDateKey(parseDateKey('2026-09-11'))).toBe('2026-09-11');
  });

  it('keeps the local day even just before midnight', () => {
    expect(localDateKey(new Date(2026, 8, 11, 23, 59))).toBe('2026-09-11');
  });
});

describe('week maths', () => {
  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex(new Date(2026, 8, 7))).toBe(0);
    expect(weekdayIndex(friday)).toBe(4);
    expect(weekdayIndex(new Date(2026, 8, 13))).toBe(6);
  });

  it('starts the week on Monday', () => {
    expect(localDateKey(startOfWeek(friday))).toBe('2026-09-07');
  });

  it('treats Sunday as the end of its week, not the start', () => {
    expect(localDateKey(startOfWeek(new Date(2026, 8, 13)))).toBe('2026-09-07');
  });

  it('moves across month boundaries', () => {
    expect(localDateKey(addDays(new Date(2026, 8, 30), 3))).toBe('2026-10-03');
    expect(localDateKey(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('counts whole days between dates', () => {
    expect(differenceInDays(new Date(2026, 8, 14), friday)).toBe(3);
    expect(differenceInDays(friday, new Date(2026, 8, 14))).toBe(-3);
    expect(differenceInDays(new Date(2026, 8, 11, 22), new Date(2026, 8, 11, 1))).toBe(0);
  });

  it('compares days, not instants', () => {
    expect(isSameDay(new Date(2026, 8, 11, 1), new Date(2026, 8, 11, 23))).toBe(true);
    expect(isSameDay(friday, new Date(2026, 8, 12))).toBe(false);
  });

  it('reports ISO week numbers', () => {
    expect(isoWeekNumber(friday)).toBe(37);
    // 1 January 2027 is a Friday, so it still belongs to week 53 of 2026.
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });
});

describe('clock maths', () => {
  it('converts a time of day to minutes and back', () => {
    expect(minutesOfDay('08:15')).toBe(495);
    expect(formatClock(495)).toBe('08:15');
    expect(formatClock(0)).toBe('00:00');
  });

  it('wraps values that fall outside the day', () => {
    expect(formatClock(1500)).toBe('01:00');
    expect(formatClock(-60)).toBe('23:00');
  });

  it('spells durations without empty parts', () => {
    expect(formatDuration(690)).toBe('11h 30m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(45)).toBe('45m');
  });
});

describe('labels', () => {
  it('collapses a range inside one month', () => {
    expect(formatWeekRange(new Date(2026, 8, 7))).toBe('7 – 13 September 2026');
  });

  it('names both months when the week straddles them', () => {
    expect(formatWeekRange(new Date(2026, 8, 28))).toBe('28 September – 4 October 2026');
  });

  it('names both years when the week straddles them', () => {
    expect(formatWeekRange(new Date(2026, 11, 28))).toBe('28 December 2026 – 3 January 2027');
  });

  it('writes a full day label', () => {
    expect(formatDayLabel(friday)).toBe('Friday, 11 September 2026');
  });

  it('prefers a relative day name when there is one', () => {
    expect(relativeDayLabel(friday, friday)).toBe('Today');
    expect(relativeDayLabel(addDays(friday, 1), friday)).toBe('Tomorrow');
    expect(relativeDayLabel(addDays(friday, -1), friday)).toBe('Yesterday');
    expect(relativeDayLabel(addDays(friday, 4), friday)).toBeNull();
  });

  it('says how long ago something happened', () => {
    const now = new Date(2026, 8, 11, 12, 0);
    expect(formatTimeAgo(new Date(2026, 8, 11, 11, 59, 40), now)).toBe('just now');
    expect(formatTimeAgo(new Date(2026, 8, 11, 11, 48), now)).toBe('12 min ago');
    expect(formatTimeAgo(new Date(2026, 8, 11, 9, 0), now)).toBe('3 h ago');
    expect(formatTimeAgo(new Date(2026, 8, 10, 12, 0), now)).toBe('yesterday');
    expect(formatTimeAgo(new Date(2026, 8, 8, 12, 0), now)).toBe('3 days ago');
  });

  it('describes how far away a week is', () => {
    expect(relativeWeekLabel(startOfWeek(friday), friday)).toBe('This week');
    expect(relativeWeekLabel(addDays(startOfWeek(friday), 7), friday)).toBe('Next week');
    expect(relativeWeekLabel(addDays(startOfWeek(friday), -7), friday)).toBe('Last week');
    expect(relativeWeekLabel(addDays(startOfWeek(friday), 21), friday)).toBe('In 3 weeks');
    expect(relativeWeekLabel(addDays(startOfWeek(friday), -14), friday)).toBe('2 weeks ago');
  });
});
