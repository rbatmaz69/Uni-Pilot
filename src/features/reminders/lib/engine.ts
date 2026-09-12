import { localDateKey, minutesOfDay, parseDateKey } from '@/lib/date';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/lib/types';

export interface ReminderRule {
  enabled: boolean;
  offsets: number[];
  dailyDays: number;
  style: 'airplane' | 'quiet';
}

export interface ReminderSettings {
  enabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
};

export function defaultRule(kind: CalendarEventKind): ReminderRule {
  const offsets =
    kind === 'exam'
      ? [10080, 2880, 60]
      : kind === 'deadline'
        ? [4320, 1440, 120]
        : kind === 'study'
          ? [0]
          : [15];
  return {
    enabled: ['exam', 'deadline', 'study'].includes(kind),
    offsets,
    dailyDays: 0,
    style: 'airplane',
  };
}

export interface ScheduledReminder {
  id: string;
  eventId: string;
  title: string;
  date: string;
  startTime: string;
  at: number;
  style: ReminderRule['style'];
  slots: { key: string; due: number; daily: boolean }[];
}

export interface ReminderHistory {
  id: string;
  eventId: string;
  title: string;
  at: number;
  shownAt: number;
  consumed: string[];
  dismissed: boolean;
  snoozeUntil: number | null;
}

export function scheduleEvents(
  events: CalendarEvent[],
  rules: Record<string, ReminderRule>,
): ScheduledReminder[] {
  return events.flatMap((event) => {
    const rule = rules[event.id] ?? defaultRule(event.kind);
    if (!rule.enabled || event.status === 'cancelled') return [];
    const start = parseDateKey(event.date);
    start.setMinutes(minutesOfDay(event.startTime));
    const at = start.getTime();
    if (!Number.isFinite(at)) return [];
    const slots: ScheduledReminder['slots'] = [...new Set(rule.offsets)].map((offset) => {
      const due = new Date(at - offset * 60_000);
      // Day reminders follow the local calendar, including across DST changes.
      if (offset >= 1440 && offset % 1440 === 0) {
        due.setTime(at);
        due.setDate(due.getDate() - offset / 1440);
        due.setHours(9, 0, 0, 0);
      }
      return { key: `offset:${offset}`, due: due.getTime(), daily: false };
    });
    for (let days = 1; days <= Math.min(rule.dailyDays, 30); days++) {
      const due = new Date(at);
      due.setDate(due.getDate() - days);
      due.setHours(9, 0, 0, 0);
      slots.push({ key: `daily:${localDateKey(due)}`, due: due.getTime(), daily: true });
    }
    return [
      {
        id: `${event.id}|${event.date}|${event.startTime}`,
        eventId: event.id,
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        at,
        style: rule.style,
        slots,
      },
    ];
  });
}

export function isQuiet(now: Date, settings: ReminderSettings): boolean {
  const minute = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(settings.quietStart);
  const end = minutesOfDay(settings.quietEnd);
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** One current reminder per event, with a shared cooldown so planes never pile up. */
export function nextReminder(
  schedule: ScheduledReminder[],
  history: ReminderHistory[],
  now: Date,
  settings: ReminderSettings,
  active: boolean,
): { event: ScheduledReminder; record: ReminderHistory } | null {
  const time = now.getTime();
  if (!active || !settings.enabled || isQuiet(now, settings)) return null;
  if (history.some((h) => time - h.shownAt < 60_000)) return null;
  for (const event of [...schedule].sort((a, b) => a.at - b.at)) {
    // A start-time reminder gets a small grace window after sleep / timer drift.
    const expires = event.at + (event.slots.some((s) => s.key === 'offset:0') ? 60_000 : 0);
    if (time >= expires) continue;
    const previous = history.find((h) => h.id === event.id);
    if (previous?.snoozeUntil && previous.snoozeUntil > time) continue;
    const due = event.slots.filter((slot) => slot.due <= time);
    const unseen = due.filter((slot) => !previous?.consumed.includes(slot.key));
    const shownToday = previous && localDateKey(new Date(previous.shownAt)) === localDateKey(now);
    const snoozed = previous?.snoozeUntil != null && previous.snoozeUntil <= time;
    if (!snoozed && !unseen.some((slot) => !slot.daily || !shownToday)) continue;
    return {
      event,
      record: {
        id: event.id,
        eventId: event.eventId,
        title: event.title,
        at: event.at,
        shownAt: time,
        consumed: [...new Set([...(previous?.consumed ?? []), ...due.map((s) => s.key)])],
        dismissed: false,
        snoozeUntil: null,
      },
    };
  }
  return null;
}

export function timingLabel(at: number, now = new Date()): string {
  const date = new Date(at);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days > 1) return `In ${days} days`;
  if (days === 1) return 'Tomorrow';
  const minutes = Math.ceil((at - now.getTime()) / 60_000);
  if (minutes < 0) return 'Event has passed';
  if (minutes === 0) return 'Starting now';
  if (minutes >= 60)
    return `In ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  return `In ${minutes} min`;
}

export function offsetLabel(minutes: number): string {
  if (minutes === 0) return 'At the start';
  if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes > 10080 ? 's' : ''}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes > 1440 ? 's' : ''}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes > 60 ? 's' : ''}`;
  return `${minutes} min`;
}
