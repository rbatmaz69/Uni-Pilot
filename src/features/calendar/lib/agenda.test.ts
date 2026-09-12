import { describe, expect, it } from 'vitest';
import { addDays, localDateKey } from '@/lib/date';
import { buildAgenda, formatDue, markedDays, type StudyTask } from './agenda';
import type { CalendarEvent } from './types';

const now = new Date(2026, 9, 2, 10, 0);
const key = (offset: number) => localDateKey(addDays(now, offset));

const task = (overrides: Partial<StudyTask> & { id: string }): StudyTask => ({
  title: 'Task',
  dueDate: key(0),
  dueTime: null,
  priority: 'med',
  courseCode: null,
  done: false,
  ...overrides,
});

const event = (overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({
  title: 'Klausur',
  kind: 'exam',
  tone: 'coral',
  date: key(0),
  startTime: '09:00',
  endTime: '11:00',
  status: 'confirmed',
  ...overrides,
});

const labels = (buckets: ReturnType<typeof buildAgenda>) => buckets.map((bucket) => bucket.label);
const titles = (buckets: ReturnType<typeof buildAgenda>, label: string) =>
  buckets.find((bucket) => bucket.label === label)?.entries.map((entry) => entry.title) ?? [];

describe('bucketing by deadline', () => {
  it('returns nothing when there is nothing', () => {
    expect(buildAgenda([], [], now)).toEqual([]);
  });

  it('sorts an item into the bucket its date earns', () => {
    const buckets = buildAgenda(
      [
        task({ id: 'a', title: 'Late', dueDate: key(-2) }),
        task({ id: 'b', title: 'Now', dueDate: key(0) }),
        task({ id: 'c', title: 'Soon', dueDate: key(3) }),
        task({ id: 'd', title: 'Far', dueDate: key(30) }),
      ],
      [],
      now,
    );

    expect(labels(buckets)).toEqual(['Overdue', 'Today', 'Next 7 days', 'Later']);
    expect(titles(buckets, 'Overdue')).toEqual(['Late']);
    expect(titles(buckets, 'Later')).toEqual(['Far']);
  });

  it('counts the seventh day as soon and the eighth as later', () => {
    const buckets = buildAgenda(
      [
        task({ id: 'a', title: 'Seventh', dueDate: key(7) }),
        task({ id: 'b', title: 'Eighth', dueDate: key(8) }),
      ],
      [],
      now,
    );

    expect(titles(buckets, 'Next 7 days')).toEqual(['Seventh']);
    expect(titles(buckets, 'Later')).toEqual(['Eighth']);
  });

  it('moves a finished task out of the way', () => {
    const buckets = buildAgenda(
      [task({ id: 'a', title: 'Done thing', dueDate: key(-5), done: true })],
      [],
      now,
    );

    expect(labels(buckets)).toEqual(['Done']);
  });

  it('keeps Done last so it never pushes live work down', () => {
    const buckets = buildAgenda(
      [task({ id: 'a', dueDate: key(0), done: true }), task({ id: 'b', dueDate: key(20) })],
      [],
      now,
    );

    expect(labels(buckets)).toEqual(['Later', 'Done']);
  });

  it('orders a day by time, with untimed items last', () => {
    const buckets = buildAgenda(
      [
        task({ id: 'a', title: 'Whenever', dueTime: null }),
        task({ id: 'b', title: 'Evening', dueTime: '23:59' }),
        task({ id: 'c', title: 'Morning', dueTime: '08:00' }),
      ],
      [],
      now,
    );

    expect(titles(buckets, 'Today')).toEqual(['Morning', 'Evening', 'Whenever']);
  });
});

describe('what the timetable contributes', () => {
  it('takes exams and deadlines but leaves lectures alone', () => {
    const buckets = buildAgenda(
      [],
      [
        event({ id: 'e1', title: 'Klausur ML', kind: 'exam' }),
        event({ id: 'e2', title: 'Abgabe', kind: 'deadline', allDay: true }),
        event({ id: 'e3', title: 'Vorlesung', kind: 'lecture' }),
      ],
      now,
    );

    expect(titles(buckets, 'Today')).toEqual(['Klausur ML', 'Abgabe']);
  });

  it('drops an exam that has already been sat', () => {
    const buckets = buildAgenda([], [event({ id: 'e1', date: key(-3) })], now);

    expect(buckets).toEqual([]);
  });

  it('keeps your own overdue task, which is still actionable', () => {
    const buckets = buildAgenda([task({ id: 'a', dueDate: key(-3) })], [], now);

    expect(labels(buckets)).toEqual(['Overdue']);
  });

  it('ignores a cancelled exam', () => {
    expect(buildAgenda([], [event({ id: 'e1', status: 'cancelled' })], now)).toEqual([]);
  });

  it('marks where each row came from', () => {
    const buckets = buildAgenda([task({ id: 'a' })], [event({ id: 'e1' })], now);
    const sources = buckets.flatMap((bucket) => bucket.entries.map((entry) => entry.source));

    expect(sources).toEqual(expect.arrayContaining(['task', 'exam']));
  });

  it('gives a task the colour of its course', () => {
    const [bucket] = buildAgenda([task({ id: 'a', courseCode: '262164' })], [], now);
    const [entry] = bucket?.entries ?? [];

    expect(entry?.tone).not.toBe('accent');
  });
});

describe('which days get a dot', () => {
  it('ignores a day that only holds lectures', () => {
    const marks = markedDays([], [event({ id: 'e1', kind: 'lecture' })]);

    expect(marks.size).toBe(0);
  });

  it('marks an exam and a deadline', () => {
    const marks = markedDays(
      [],
      [
        event({ id: 'e1', kind: 'exam', date: key(1) }),
        event({ id: 'e2', kind: 'deadline', date: key(2) }),
      ],
    );

    expect(marks.get(key(1))).toBe('exam');
    expect(marks.get(key(2))).toBe('due');
  });

  it('marks a day that holds an open task of your own', () => {
    const marks = markedDays([task({ id: 'a', dueDate: key(3) })], []);

    expect(marks.get(key(3))).toBe('due');
  });

  it('leaves a finished task unmarked', () => {
    const marks = markedDays([task({ id: 'a', dueDate: key(3), done: true })], []);

    expect(marks.size).toBe(0);
  });

  it('lets an exam outrank a task on the same day', () => {
    const marks = markedDays(
      [task({ id: 'a', dueDate: key(1) })],
      [event({ id: 'e1', kind: 'exam', date: key(1) })],
    );

    expect(marks.get(key(1))).toBe('exam');
  });

  it('keeps the exam even when the task is read first', () => {
    const marks = markedDays(
      [task({ id: 'a', dueDate: key(1) })],
      [
        event({ id: 'e1', kind: 'deadline', date: key(1) }),
        event({ id: 'e2', kind: 'exam', date: key(1) }),
      ],
    );

    expect(marks.get(key(1))).toBe('exam');
  });

  it('ignores a cancelled exam', () => {
    const marks = markedDays([], [event({ id: 'e1', kind: 'exam', status: 'cancelled' })]);

    expect(marks.size).toBe(0);
  });

  it('marks days in the past as well, which the month still shows', () => {
    const marks = markedDays([task({ id: 'a', dueDate: key(-5) })], []);

    expect(marks.get(key(-5))).toBe('due');
  });
});

describe('due wording', () => {
  const entryFor = (offset: number, dueTime: string | null = null) => {
    const [entry] = buildAgenda(
      [task({ id: 'a', dueDate: key(offset), dueTime })],
      [],
      now,
    ).flatMap((bucket) => bucket.entries);
    if (!entry) throw new Error('expected exactly one entry');
    return entry;
  };

  it('prefers relative wording near today', () => {
    expect(formatDue(entryFor(0), now)).toBe('Today');
    expect(formatDue(entryFor(1), now)).toBe('Tomorrow');
    expect(formatDue(entryFor(-1), now)).toBe('Yesterday');
    expect(formatDue(entryFor(4), now)).toBe('In 4 days');
    expect(formatDue(entryFor(-3), now)).toBe('3 days ago');
  });

  it('switches to a date once relative stops helping', () => {
    expect(formatDue(entryFor(30), now)).toBe('1 Nov');
  });

  it('appends a time when the deadline has one', () => {
    expect(formatDue(entryFor(1, '23:59'), now)).toBe('Tomorrow, 23:59');
  });
});
