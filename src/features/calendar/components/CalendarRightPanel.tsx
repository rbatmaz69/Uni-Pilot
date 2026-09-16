import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateKey, MONTH_NAMES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { AgendaList } from './AgendaList';
import { DAY_MARKER_LABELS, markedDays } from '@/features/calendar/lib/agenda';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { playDayHoverSound } from '@/features/calendar/lib/calendarSound';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { SpecialEventsSection } from './SpecialEventsSection';

interface CalendarRightPanelProps {
  focusDay: Date;
  onSelectDate: (date: Date) => void;
  events?: readonly CalendarEvent[];
  /** Passed in rather than read here so countdowns tick with the grid. */
  now?: Date;
  className?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
}

export function CalendarRightPanel({
  focusDay,
  onSelectDate,
  events = [],
  now,
  className,
  onSelectEvent,
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

  // A cover that 404s has to fall back to the numeral, and only the cell knows
  // how to draw that — so the failure is tracked here, keyed by image source.
  const [brokenCovers, setBrokenCovers] = useState<ReadonlySet<string>>(() => new Set());

  const tasks = useTaskStore((state) => state.tasks);
  const markers = useMemo(() => markedDays(tasks, events), [tasks, events]);
  const covers = useMemo(() => {
    const byDate = new Map<string, CalendarEvent>();
    const priority = (event: CalendarEvent) =>
      event.kind === 'exam' ? 0 : event.kind === 'deadline' ? 1 : 2;
    const illustrated = events
      .filter((event) => (event.coverImage || event.feature?.image) && event.status !== 'cancelled')
      .sort(
        (a, b) =>
          priority(a) - priority(b) ||
          a.startTime.localeCompare(b.startTime) ||
          a.id.localeCompare(b.id),
      );
    for (const event of illustrated) if (!byDate.has(event.date)) byDate.set(event.date, event);
    return byDate;
  }, [events]);

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = month.getDay(); // 0 for Sunday
    const leadingCount = firstDayOfWeek;
    const prevMonthLastDate = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
    const daysInMonthCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    // Complete rows while always including at least days 1–7 of next month.
    const totalSlots = Math.ceil((leadingCount + daysInMonthCount + 7) / 7) * 7;
    const trailingCount = totalSlots - (leadingCount + daysInMonthCount);

    interface MonthCell {
      date: Date;
      dayNumber: number;
      isCurrentMonth: boolean;
    }

    const cells: MonthCell[] = [];

    // Trailing days from previous month
    for (let i = leadingCount - 1; i >= 0; i--) {
      const day = prevMonthLastDate - i;
      cells.push({
        date: new Date(month.getFullYear(), month.getMonth() - 1, day),
        dayNumber: day,
        isCurrentMonth: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonthCount; d++) {
      cells.push({
        date: new Date(month.getFullYear(), month.getMonth(), d),
        dayNumber: d,
        isCurrentMonth: true,
      });
    }

    // Leading days from next month
    for (let d = 1; d <= trailingCount; d++) {
      cells.push({
        date: new Date(month.getFullYear(), month.getMonth() + 1, d),
        dayNumber: d,
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [month]);

  return (
    <aside
      aria-label="Calendar sidebar"
      className={cn(
        'flex flex-1 flex-col overflow-y-auto rounded-l-[22px] border-y border-l border-r-0 border-line bg-surface p-3.5 shadow-xs min-h-0',
        className,
      )}
    >
      {/* 1. Mini Month Calendar (Monatsansicht) */}
      <div className="shrink-0">
        {/* Month Header with Navigation */}
        <div className="flex items-center justify-between px-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
            className="grid h-7 w-7 place-items-center rounded-full text-secondary transition-colors hover:bg-surface-secondary hover:text-primary active:scale-95"
          >
            <ChevronLeft size={17} strokeWidth={2.2} />
          </button>

          <div className="flex items-center gap-1">
            <h3 className="text-[15px] font-bold tracking-tight text-primary">
              {MONTH_NAMES[month.getMonth()]}{' '}
              <span className="font-semibold text-muted/70">&rsquo;{shortYear(month)}</span>
            </h3>
            {/* Folding the month away is what gives the list room once a
                semester's worth of deadlines is in it. */}
            <button
              type="button"
              aria-label={monthOpen ? 'Collapse the month' : 'Expand the month'}
              aria-expanded={monthOpen}
              onClick={() => setMonthOpen((previous) => !previous)}
              className="grid h-5 w-5 place-items-center rounded text-secondary/60 transition-colors hover:bg-surface-secondary hover:text-primary"
            >
              <ChevronDown
                size={13}
                strokeWidth={2.2}
                aria-hidden
                className={cn('transition-transform duration-200', !monthOpen && '-rotate-90')}
              />
            </button>
          </div>

          <button
            type="button"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
            className="grid h-7 w-7 place-items-center rounded-full text-secondary transition-colors hover:bg-surface-secondary hover:text-primary active:scale-95"
          >
            <ChevronRight size={17} strokeWidth={2.2} />
          </button>
        </div>

        {monthOpen ? (
          <>
            {/* Weekday Capsule Pill (Sun Mon Tue Wed Thu Fri Sat) */}
            <div className="mt-2.5 mb-1.5 -mx-1 grid grid-cols-7 rounded-2xl bg-surface-secondary/90 dark:bg-white/[0.05] py-2 px-1 text-center text-[12px] font-medium text-secondary">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <span key={day} className="py-0.5">
                  {day}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-[12px] tabular-nums">
              {calendarCells.map((cell) => {
                const key = localDateKey(cell.date);
                const isToday = key === todayKey;
                const isFocused = key === focusKey;
                const marker = markers.get(key);
                const cover = covers.get(key);
                const coverSource = cover?.coverImage || cover?.feature?.image;
                const coverImage =
                  coverSource && !brokenCovers.has(coverSource) ? coverSource : undefined;

                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${cell.date.toLocaleDateString('en', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}${cover ? `, ${cover.title}` : ''}${marker ? `, ${DAY_MARKER_LABELS[marker]}` : ''}`}
                    title={cover?.title}
                    onMouseEnter={() => playDayHoverSound(cell.dayNumber)}
                    onClick={() => {
                      onSelectDate(cell.date);
                      if (!cell.isCurrentMonth) {
                        setMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                      }
                    }}
                    className={cn(
                      'relative isolate mx-auto grid h-8 w-8 place-items-center text-[11.5px] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      coverImage ? 'rounded-[10px]' : 'rounded-full',
                      coverImage &&
                        isFocused &&
                        'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                      isFocused &&
                        'bg-[#3e5bf6] dark:bg-[#526cf8] font-bold text-white shadow-sm shadow-[#3e5bf6]/30',
                      !isFocused &&
                        isToday &&
                        'border-2 border-[#3e5bf6] dark:border-[#526cf8] font-bold text-[#3e5bf6] dark:text-[#526cf8]',
                      !isFocused &&
                        !isToday &&
                        cell.isCurrentMonth &&
                        'font-medium text-primary hover:bg-surface-secondary hover:text-primary active:scale-95',
                      !isFocused &&
                        !isToday &&
                        !cell.isCurrentMonth &&
                        'font-normal text-muted/70 hover:bg-surface-secondary/70 hover:text-secondary active:scale-95',
                    )}
                  >
                    {coverImage ? (
                      // The artwork stands in for the whole cell: numeral and
                      // dot would only sit in front of the picture.
                      <DayCover
                        image={coverImage}
                        imageHeight={cover?.feature?.imageHeight}
                        onFailed={() =>
                          setBrokenCovers((previous) => new Set(previous).add(coverImage))
                        }
                      />
                    ) : (
                      <>
                        <span className="relative">{cell.dayNumber}</span>
                        {marker ? (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute bottom-0.5 h-1 w-1 rounded-full',
                              isFocused
                                ? 'bg-white'
                                : marker === 'exam'
                                  ? 'bg-coral'
                                  : 'bg-[#3e5bf6] dark:bg-[#526cf8]',
                            )}
                          />
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      <div className="my-3 border-t border-line-soft" />

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          onSelectEvent &&
            events.some(
              (event) => event.feature && event.status !== 'cancelled' && event.date >= todayKey,
            ) &&
            'min-h-[240px] shrink-0',
        )}
      >
        <AgendaList events={events} now={clock} />
      </div>

      {onSelectEvent && (
        <SpecialEventsSection events={events} now={clock} onSelect={onSelectEvent} />
      )}
    </aside>
  );
}

/** "2026" is noise beside the month; the calendar never spans more than a year or two. */
function shortYear(date: Date) {
  return String(date.getFullYear() % 100).padStart(2, '0');
}

function DayCover({
  image,
  imageHeight,
  onFailed,
}: {
  image: string;
  imageHeight: number | undefined;
  onFailed: () => void;
}) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden rounded-[inherit] ring-1 ring-black/10 dark:ring-white/15"
    >
      <img
        src={image}
        style={imageHeight ? { height: `${100 / imageHeight}%`, objectPosition: 'top' } : undefined}
        alt=""
        onError={onFailed}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
