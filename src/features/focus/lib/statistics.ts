import { addDays, localDateKey, startOfDay, startOfWeek } from '@/lib/date';
import type { FocusSession } from '@/features/focus/store/focusStore';

export function formatFocusTime(ms: number): string {
  if (ms > 0 && ms < 60_000) return '<1 min';
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

export function focusStatistics(sessions: FocusSession[], now: Date) {
  const daily = new Map<string, number>();
  const completedDays = new Set<string>();
  for (const session of sessions) {
    if (session.outcome === 'completed')
      completedDays.add(localDateKey(new Date(session.finishedAt)));
    for (const segment of session.segments) {
      let cursor = segment.start;
      while (cursor < segment.end) {
        const day = startOfDay(new Date(cursor));
        const end = Math.min(segment.end, addDays(day, 1).getTime());
        const key = localDateKey(day);
        daily.set(key, (daily.get(key) ?? 0) + end - cursor);
        cursor = end;
      }
    }
  }
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startOfWeek(now), index);
    return { date, ms: daily.get(localDateKey(date)) ?? 0 };
  });
  const recentDays = Array.from({ length: 28 }, (_, index) => {
    const date = addDays(now, index - 27);
    return { date, ms: daily.get(localDateKey(date)) ?? 0 };
  });
  let streak = 0;
  let cursor = completedDays.has(localDateKey(now)) ? now : addDays(now, -1);
  while (completedDays.has(localDateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return {
    todayMs: daily.get(localDateKey(now)) ?? 0,
    weekMs: week.reduce((sum, day) => sum + day.ms, 0),
    completed: sessions.filter((session) => session.outcome === 'completed').length,
    streak,
    week,
    recentDays,
  };
}
