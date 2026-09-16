import { describe, expect, it } from 'vitest';
import {
  defaultRule,
  isQuiet,
  nextReminder,
  scheduleEvents,
  type ReminderHistory,
  type ReminderRule,
} from './engine';
import type { CalendarEvent } from '@/features/calendar/lib/types';

const exam: CalendarEvent = {
  id: 'exam',
  title: 'Algorithms',
  date: '2026-09-20',
  startTime: '10:00',
  endTime: '12:00',
  kind: 'exam',
  tone: 'coral',
  status: 'confirmed',
};
const settings = { enabled: true, quietStart: '22:00', quietEnd: '08:00' };
const at = (day: number, hour = 10, minute = 0) => new Date(2026, 8, day, hour, minute);
const schedule = (rule = defaultRule('exam')) => scheduleEvents([exam], { exam: rule });
const deliver = (day: number, history: ReminderHistory[] = [], rule = defaultRule('exam')) =>
  nextReminder(schedule(rule), history, at(day), settings, true);

describe('Calendar reminders', () => {
  it('uses exam milestones and makes lectures opt-in', () => {
    expect(defaultRule('exam').offsets).toEqual([10080, 2880, 60]);
    expect(defaultRule('exam').dailyDays).toBe(0);
    expect(defaultRule('lecture').enabled).toBe(false);
    expect(defaultRule('deadline').offsets).toEqual([4320, 1440, 120]);
  });
  it('schedules day reminders at 09:00 and short reminders relative to start', () => {
    expect(schedule()[0]?.slots.map((s) => s.due)).toEqual([
      at(13, 9).getTime(),
      at(18, 9).getTime(),
      at(20, 9).getTime(),
    ]);
    expect(nextReminder(schedule(), [], at(13, 8, 59), settings, true)).toBeNull();
    expect(nextReminder(schedule(), [], at(13, 9), settings, true)).not.toBeNull();
  });
  it('uses calendar days over the autumn DST change', () => {
    const event = { ...exam, date: '2026-10-26' };
    const slots = scheduleEvents([event], { exam: { ...defaultRule('exam'), offsets: [2880] } })[0]!
      .slots;
    const due = new Date(slots[0]!.due);
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours()]).toEqual([
      2026, 9, 24, 9,
    ]);
  });
  it('coalesces missed reminders into one current delivery', () => {
    const first = deliver(19)!;
    expect(first.record.consumed).toEqual(['offset:10080', 'offset:2880']);
    expect(deliver(19, [first.record])).toBeNull();
    expect(nextReminder(schedule(), [first.record], at(20, 9), settings, true)).not.toBeNull();
  });
  it('persists deduplication across a serialized restart', () => {
    const first = deliver(18)!.record;
    const restored = JSON.parse(JSON.stringify([first])) as ReminderHistory[];
    expect(deliver(19, restored)).toBeNull();
  });
  it('defers while idle and during quiet hours without consuming reminders', () => {
    expect(nextReminder(schedule(), [], at(18), settings, false)).toBeNull();
    expect(nextReminder(schedule(), [], at(18, 23), settings, true)).toBeNull();
    expect(nextReminder(schedule(), [], at(19, 8), settings, true)).not.toBeNull();
    expect(isQuiet(at(18, 22), settings)).toBe(true);
    expect(isQuiet(at(19, 8), settings)).toBe(false);
    expect(isQuiet(at(18, 23), { ...settings, quietStart: '00:00', quietEnd: '00:00' })).toBe(
      false,
    );
    expect(isQuiet(at(18, 12), { ...settings, quietStart: '11:00', quietEnd: '14:00' })).toBe(true);
  });
  it('does not repeat daily reminders on the same day or duplicate a milestone', () => {
    const rule = { ...defaultRule('exam'), dailyDays: 3 };
    const first = deliver(18, [], rule)!.record;
    expect(nextReminder(schedule(rule), [first], at(18, 17), settings, true)).toBeNull();
    expect(deliver(19, [first], rule)).not.toBeNull();
  });
  it('dismisses this reminder while preserving later milestones', () => {
    const first = { ...deliver(13)!.record, dismissed: true };
    expect(deliver(14, [first])).toBeNull();
    expect(deliver(18, [first])).not.toBeNull();
  });
  it('snoozes without losing later reminders and never snoozes past the event', () => {
    const first = { ...deliver(18)!.record, snoozeUntil: at(18, 10, 30).getTime() };
    expect(nextReminder(schedule(), [first], at(18, 10, 15), settings, true)).toBeNull();
    const next = nextReminder(schedule(), [first], at(18, 10, 30), settings, true)!;
    expect(next.record.snoozeUntil).toBeNull();
    expect(nextReminder(schedule(), [first], at(20, 11), settings, true)).toBeNull();
  });
  it('stops for cancelled, muted, deleted and past events', () => {
    expect(scheduleEvents([{ ...exam, status: 'cancelled' }], {})).toEqual([]);
    expect(schedule({ ...defaultRule('exam'), enabled: false })).toEqual([]);
    expect(scheduleEvents([], {})).toEqual([]);
    expect(deliver(21)).toBeNull();
    expect(nextReminder(schedule(), [], at(18), { ...settings, enabled: false }, true)).toBeNull();
  });
  it('starts a new occurrence when an exam is rescheduled', () => {
    const first = deliver(18)!.record;
    const moved = scheduleEvents([{ ...exam, date: '2026-09-22' }], {});
    expect(nextReminder(moved, [first], at(20), settings, true)?.record.id).not.toBe(first.id);
  });
  it('allows a start-time reminder with a minute of timer-drift tolerance', () => {
    const rule: ReminderRule = { ...defaultRule('study'), offsets: [0] };
    expect(nextReminder(schedule(rule), [], at(20, 10), settings, true)).not.toBeNull();
    expect(nextReminder(schedule(rule), [], at(20, 10, 1), settings, true)).toBeNull();
  });
  it('spaces simultaneous events apart', () => {
    const events = scheduleEvents([exam, { ...exam, id: 'second', title: 'Other exam' }], {});
    const first = nextReminder(events, [], at(18), settings, true)!;
    expect(nextReminder(events, [first.record], at(18, 10, 0), settings, true)).toBeNull();
    expect(nextReminder(events, [first.record], at(18, 10, 1), settings, true)?.event.eventId).toBe(
      'second',
    );
  });
});
