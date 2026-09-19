import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Flame, Leaf, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localDateKey, MONTH_NAMES, WEEKDAY_SHORT } from '@/lib/date';
import { focusStatistics, formatFocusTime } from '@/features/focus/lib/statistics';
import type { FocusSession } from '@/features/focus/store/focusStore';

interface FocusStatisticsPanelProps {
  open: boolean;
  sessions: FocusSession[];
  dayKey: string;
  onClose: () => void;
}

export function FocusStatisticsPanel({
  open,
  sessions,
  dayKey,
  onClose,
}: FocusStatisticsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const stats = useMemo(
    () => focusStatistics(sessions, new Date(dayKey + 'T12:00:00')),
    [sessions, dayKey],
  );
  useLayoutEffect(() => {
    if (open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    openerRef.current = null;
  }, [open]);

  const maxWeekMs = Math.max(60_000, ...stats.week.map((day) => day.ms));
  const hovered = hoveredDay === null ? null : stats.recentDays[hoveredDay];
  const intensityClass = (ms: number) => {
    const minutes = ms / 60_000;
    if (minutes === 0) return 'focus-habit-empty';
    if (minutes < 20) return 'focus-habit-low';
    if (minutes < 40) return 'focus-habit-medium';
    return 'focus-habit-high';
  };

  return (
    <div
      className="focus-statistics-layer absolute inset-0 z-20"
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        aria-hidden="true"
        className="focus-statistics-backdrop absolute inset-0"
        onMouseDown={onClose}
      />
      <div
        id="focus-statistics"
        ref={panelRef}
        role="dialog"
        aria-label="Focus statistics"
        aria-modal="true"
        tabIndex={open ? -1 : undefined}
        onTransitionEnd={(event) => {
          if (!open && event.propertyName === 'transform') setHoveredDay(null);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="focus-statistics-panel absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col overflow-hidden text-left"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-base font-semibold">Focus statistics</h2>
            <p className="mt-1 text-xs text-[var(--focus-stats-muted)]">Stored on this device</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close statistics"
            onClick={onClose}
            className="focus-panel-close grid h-7 w-7 place-items-center rounded-full"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-6 pb-[88px] pt-5">
          <section aria-label="Focus progress">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Today', value: formatFocusTime(stats.todayMs), icon: Clock3 },
                { label: 'This week', value: formatFocusTime(stats.weekMs), icon: Leaf },
                { label: 'Sessions', value: String(stats.completed), icon: Check },
                {
                  label: 'Streak',
                  value: `${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`,
                  icon: Flame,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="focus-stat-card rounded-xl px-4 py-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--focus-stats-muted)]">
                    <Icon size={14} aria-hidden />
                    {label}
                  </div>
                  <p className="text-[22px] font-semibold tracking-[-0.02em]">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="my-5 h-px bg-[var(--focus-stats-border)]" />

          <section aria-label="This week’s focus time">
            <h3 className="mb-3.5 text-xs font-medium uppercase tracking-[0.08em] text-[var(--focus-stats-muted)]">
              This week
            </h3>
            <div className="flex h-[88px] gap-1.5">
              {stats.week.map((day, index) => (
                <div
                  key={day.date.toISOString()}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  aria-label={`${WEEKDAY_SHORT[index]}: ${formatFocusTime(day.ms)}`}
                >
                  <div className="flex min-h-0 w-full flex-1 items-end" aria-hidden>
                    <div
                      className={cn(
                        'w-full',
                        day.ms === 0
                          ? 'focus-week-bar-empty h-1.5 rounded-[3px]'
                          : localDateKey(day.date) === dayKey
                            ? 'focus-week-bar-today rounded-[4px_4px_3px_3px]'
                            : 'focus-week-bar-active rounded-[4px_4px_3px_3px]',
                      )}
                      style={{
                        height: day.ms ? `${Math.max(8, (day.ms / maxWeekMs) * 100)}%` : undefined,
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px]',
                      localDateKey(day.date) === dayKey
                        ? 'font-semibold text-[var(--focus-stats-accent)]'
                        : 'text-[var(--focus-stats-muted)]',
                    )}
                  >
                    {WEEKDAY_SHORT[index]?.slice(0, 1)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="mb-5 mt-6 h-px bg-[var(--focus-stats-border)]" />

          <section aria-label="Last 28 days of focus">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--focus-stats-muted)]">
                Last 28 days
              </h3>
              {stats.streak > 0 && (
                <span className="text-xs font-medium text-[var(--focus-stats-accent)]">
                  {stats.streak} day streak
                </span>
              )}
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="text-center text-[9px] text-[var(--focus-stats-muted)]"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {stats.recentDays.map((day, index) => (
                <button
                  type="button"
                  key={localDateKey(day.date)}
                  aria-label={`${MONTH_NAMES[day.date.getMonth()]} ${day.date.getDate()}: ${formatFocusTime(day.ms)}`}
                  className={cn(
                    'aspect-square rounded',
                    intensityClass(day.ms),
                    localDateKey(day.date) === dayKey && 'focus-habit-today',
                  )}
                  onMouseEnter={() => setHoveredDay(index)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => setHoveredDay(index)}
                  onBlur={() => setHoveredDay(null)}
                />
              ))}
            </div>
            <p
              className={cn(
                'mt-2 min-h-4 text-[11px] text-[var(--focus-stats-muted)] transition-opacity duration-150',
                hovered ? 'opacity-100' : 'opacity-0',
              )}
              aria-live="polite"
            >
              {hovered
                ? `${MONTH_NAMES[hovered.date.getMonth()]} ${hovered.date.getDate()} · ${hovered.ms ? formatFocusTime(hovered.ms) : 'no focus'}`
                : '\u00a0'}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1.5 text-[10px] text-[var(--focus-stats-muted)]">
              {[
                ['focus-habit-empty', 'No focus'],
                ['focus-habit-low', '< 20 min'],
                ['focus-habit-medium', '20–40 min'],
                ['focus-habit-high', '40+ min'],
              ].map(([className, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-[2px]', className)} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </section>

          <div className="mb-5 mt-6 h-px bg-[var(--focus-stats-border)]" />

          <section aria-label="Recent focus sessions">
            <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--focus-stats-muted)]">
              Recent sessions
            </h3>
            {sessions.length === 0 ? (
              <p className="py-5 text-sm text-[var(--focus-stats-muted)]">
                Your first completed focus session will appear here.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--focus-stats-border)]">
                {sessions.slice(0, 4).map((session) => (
                  <li key={session.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--focus-stats-accent-subtle)] text-[var(--focus-stats-accent)]">
                      <Check size={14} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" title={session.goal}>
                        {session.goal || 'Focus session'}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--focus-stats-muted)]">
                        {MONTH_NAMES[new Date(session.finishedAt).getMonth()]}{' '}
                        {new Date(session.finishedAt).getDate()} ·{' '}
                        {session.outcome === 'completed' ? 'Completed' : 'Ended early'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--focus-stats-muted)]">
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
  );
}
