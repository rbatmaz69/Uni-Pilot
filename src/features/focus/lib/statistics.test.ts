import { describe, expect, it } from 'vitest';
import { focusStatistics } from '@/features/focus/lib/statistics';
import type { FocusSession } from '@/features/focus/store/focusStore';

function session(
  start: string,
  end: string,
  outcome: FocusSession['outcome'] = 'completed',
): FocusSession {
  return {
    id: start,
    goal: '',
    plannedMs: 60_000,
    focusedMs: +new Date(end) - +new Date(start),
    finishedAt: +new Date(end),
    outcome,
    segments: [{ start: +new Date(start), end: +new Date(end) }],
  };
}

describe('focus statistics in local time', () => {
  it('starts with real zeros', () => {
    expect(focusStatistics([], new Date())).toMatchObject({
      todayMs: 0,
      weekMs: 0,
      completed: 0,
      streak: 0,
    });
  });

  it('splits work across midnight and the Monday week boundary', () => {
    const stats = focusStatistics(
      [session('2026-09-13T23:45:00', '2026-09-14T00:15:00')],
      new Date('2026-09-14T12:00:00'),
    );
    expect(stats.todayMs).toBe(15 * 60_000);
    expect(stats.weekMs).toBe(15 * 60_000);
    expect(stats.week[0]?.ms).toBe(15 * 60_000);
    expect(stats.recentDays).toHaveLength(28);
    expect(stats.recentDays.at(-1)?.ms).toBe(15 * 60_000);
    expect(stats.completed).toBe(1);
  });

  it('keeps yesterday’s streak alive and counts early work without a completion', () => {
    const sessions = [
      session('2026-09-10T10:00:00', '2026-09-10T10:25:00'),
      session('2026-09-11T10:00:00', '2026-09-11T10:25:00'),
      session('2026-09-12T10:00:00', '2026-09-12T10:05:00', 'ended'),
    ];
    expect(focusStatistics(sessions, new Date('2026-09-12T12:00:00'))).toMatchObject({
      todayMs: 5 * 60_000,
      weekMs: 55 * 60_000,
      completed: 2,
      streak: 2,
    });
    expect(focusStatistics(sessions, new Date('2026-09-13T12:00:00')).streak).toBe(0);
  });
});
