import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateKey, MONTH_NAMES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { AgendaList } from './AgendaList';
import { DAY_MARKER_LABELS, markedDays } from '@/features/calendar/lib/agenda';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import type { CalendarEvent } from '@/features/calendar/lib/types';

interface CalendarRightPanelProps {
  focusDay: Date;
  onSelectDate: (date: Date) => void;
  events?: readonly CalendarEvent[];
  /** Passed in rather than read here so countdowns tick with the grid. */
  now?: Date;
  className?: string;
}

export function CalendarRightPanel({
  focusDay,
  onSelectDate,
  events = [],
  now,
  className,
}: CalendarRightPanelProps) {
  // Fixed for the lifetime of the panel when the caller has no clock of its own.
  const [fallbackNow] = useState(() => new Date());
  const clock = now ?? fallbackNow;
  const [monthOpen, setMonthOpen] = useState(true);
  const todayKey = localDateKey(clock);
  const focusKey = localDateKey(focusDay);

  const [month, setMonth] = useState(
    () => new Date(focusDay.getFullYear(), focusDay.getMonth(), 1),
  );
  const [syncedTo, setSyncedTo] = useState(focusKey);

  // Adjusted during render instead of in an effect. React re-runs the
  // component immediately and never paints the stale month, where an effect
  // shows the old one for a frame and cascades a second render.
  if (syncedTo !== focusKey) {
    setSyncedTo(focusKey);
    setMonth(new Date(focusDay.getFullYear(), focusDay.getMonth(), 1));
  }

  const changeMonth = (direction: number) => {
    setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + direction, 1));
  };
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7; // Monday = 0

  const tasks = useTaskStore((state) => state.tasks);
  const markers = useMemo(() => markedDays(tasks, events), [tasks, events]);

  return (
    <aside
      aria-label="Calendar sidebar"
      className={cn(
        'flex flex-1 flex-col overflow-hidden rounded-l-[22px] border-y border-l border-r-0 border-line bg-surface p-3.5 shadow-xs min-h-0',
        className,
      )}
    >
      {/* 1. Mini Month Calendar (Monatsansicht) */}
      <div>
        {/* Month Header with Navigation */}
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold tracking-tight text-primary">
            {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
          </h3>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
              className="grid h-6 w-6 place-items-center rounded-lg text-secondary transition-colors hover:bg-surface-secondary hover:text-primary"
            >
              <ChevronLeft size={14} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
              className="grid h-6 w-6 place-items-center rounded-lg text-secondary transition-colors hover:bg-surface-secondary hover:text-primary"
            >
              <ChevronRight size={14} strokeWidth={2.2} />
            </button>
            {/* Folding the month away is what gives the list room once a
                semester's worth of deadlines is in it. */}
            <button
              type="button"
              aria-label={monthOpen ? 'Collapse the month' : 'Expand the month'}
              aria-expanded={monthOpen}
              onClick={() => setMonthOpen((previous) => !previous)}
              className="grid h-6 w-6 place-items-center rounded-lg text-secondary transition-colors hover:bg-surface-secondary hover:text-primary"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.2}
                aria-hidden
                className={cn('transition-transform', !monthOpen && '-rotate-90')}
              />
            </button>
          </div>
        </div>

        {monthOpen ? (
          <>
            {/* Weekday Initials (M T W T F S S) */}
            <div className="mt-2.5 grid grid-cols-7 text-center text-[10px] font-semibold text-muted">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <span key={i} className="py-0.5">
                  {day}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-[11.5px] tabular-nums">
              {Array.from({ length: offset }, (_, i) => (
                <span key={`blank-${i}`} className="h-6.5 w-6.5" />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
                const key = localDateKey(date);
                const isToday = key === todayKey;
                const isFocused = key === focusKey;
                const marker = markers.get(key);

                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${date.toLocaleDateString('en', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}${marker ? `, ${DAY_MARKER_LABELS[marker]}` : ''}`}
                    onClick={() => onSelectDate(date)}
                    className={cn(
                      'relative mx-auto grid h-6.5 w-6.5 place-items-center rounded-full text-[11px] font-medium transition-all',
                      isFocused && 'bg-accent font-bold text-accent-foreground shadow-xs',
                      !isFocused && isToday && 'border border-accent text-accent font-bold',
                      !isFocused &&
                        !isToday &&
                        'text-secondary hover:bg-surface-secondary hover:text-primary',
                    )}
                  >
                    <span>{index + 1}</span>
                    {marker ? (
                      <span
                        aria-hidden
                        className={cn(
                          'absolute bottom-0.5 h-1 w-1 rounded-full',
                          isFocused
                            ? 'bg-accent-foreground'
                            : marker === 'exam'
                              ? 'bg-coral'
                              : 'bg-accent',
                        )}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      <div className="my-3 border-t border-line-soft" />

      <AgendaList events={events} now={clock} />
    </aside>
  );
}
