import { useEffect, useMemo, useRef } from 'react';
import { Check, Clock3, Flame, Leaf, X } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { localDateKey, WEEKDAY_SHORT } from '@/lib/date';
import { focusStatistics, formatFocusTime } from '@/features/focus/lib/statistics';
import type { FocusSession } from '@/features/focus/store/focusStore';

interface FocusStatisticsPanelProps {
  sessions: FocusSession[];
  dayKey: string;
  onClose: () => void;
}

export function FocusStatisticsPanel({ sessions, dayKey, onClose }: FocusStatisticsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(
    () => focusStatistics(sessions, new Date(dayKey + 'T12:00:00')),
    [sessions, dayKey],
  );
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-start justify-end sm:inset-5">
      <div
        id="focus-statistics"
        ref={panelRef}
        role="dialog"
        aria-label="Focus statistics"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="pointer-events-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface/95 text-primary shadow-raised backdrop-blur-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Focus statistics</h2>
          <IconButton label="Close statistics" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="scroll-area min-h-0 space-y-5 overflow-y-auto p-5">
          <section aria-label="Focus progress" className="py-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Small steps, real progress</h2>
              <span className="text-xs text-muted">
                Your saved sessions · stored on this device
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Focus today', value: formatFocusTime(stats.todayMs), icon: Clock3 },
                { label: 'This week', value: formatFocusTime(stats.weekMs), icon: Leaf },
                { label: 'Completed sessions', value: String(stats.completed), icon: Check },
                {
                  label: 'Current streak',
                  value: `${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`,
                  icon: Flame,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-line bg-surface px-4 py-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-secondary">
                    <Icon size={14} aria-hidden />
                    {label}
                  </div>
                  <p className="text-2xl font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section
              aria-label="This week’s focus time"
              className="rounded-xl border border-line bg-surface p-5"
            >
              <h2 className="text-sm font-semibold">A week of showing up</h2>
              <div className="mt-5 grid grid-cols-7 gap-3">
                {stats.week.map((day, index) => (
                  <div
                    key={day.date.toISOString()}
                    className="flex min-w-0 flex-col items-center gap-2"
                    aria-label={`${WEEKDAY_SHORT[index]}: ${formatFocusTime(day.ms)}`}
                  >
                    <span className="text-[10px] text-muted">
                      {day.ms ? Math.floor(day.ms / 60_000) || '<1' : '0'}m
                    </span>
                    <div
                      className="flex h-16 w-full max-w-8 items-end rounded-md bg-surface-secondary"
                      aria-hidden
                    >
                      <div
                        className={cn(
                          'w-full rounded-md',
                          localDateKey(day.date) === dayKey ? 'bg-accent' : 'bg-accent/35',
                        )}
                        style={{
                          height: `${day.ms ? Math.max(5, (day.ms / Math.max(60_000, ...stats.week.map((entry) => entry.ms))) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span
                      className={cn(
                        'text-[10px]',
                        localDateKey(day.date) === dayKey
                          ? 'font-semibold text-accent'
                          : 'text-muted',
                      )}
                    >
                      {WEEKDAY_SHORT[index]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section
              aria-label="Recent focus sessions"
              className="rounded-xl border border-line bg-surface p-5"
            >
              <h2 className="text-sm font-semibold">Recent sessions</h2>
              {sessions.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center text-center">
                  <Leaf size={22} className="mb-3 text-muted" aria-hidden />
                  <p className="text-sm text-secondary">Your first session starts here.</p>
                  <p className="mt-1 text-xs text-muted">
                    Set a little time aside. We’ll keep track of it.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line-soft">
                  {sessions.slice(0, 4).map((session) => (
                    <li key={session.id} className="flex items-center gap-3 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                        <Check size={14} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={session.goal}>
                          {session.goal || 'Focus session'}
                        </p>
                        <p className="mt-1 text-[10px] text-muted">
                          {new Date(session.finishedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {session.outcome === 'completed' ? 'Completed' : 'Ended early'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-secondary">
                        {formatFocusTime(session.focusedMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
