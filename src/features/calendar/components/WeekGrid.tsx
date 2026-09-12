import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { CalendarOff, Plus, Rss } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import {
  formatClock,
  formatDayLabel,
  isSameDay,
  localDateKey,
  minutesOfDay,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '@/lib/date';
import { cn } from '@/lib/utils';
import { AllDayEventChip, CalendarEventCard } from './CalendarEventCard';
import { gridBounds, layoutDayEvents } from '@/features/calendar/lib/layout';
import { TASK_SLOT_MINUTES, TaskChip, TimedTaskCard } from './TaskCard';
import type { StudyTask } from '@/features/calendar/lib/agenda';
import type { CalendarEvent, CalendarView } from '@/features/calendar/lib/types';

interface WeekGridProps {
  days: readonly Date[];
  /** Already filtered — the grid draws whatever it is handed. */
  events: readonly CalendarEvent[];
  now: Date;
  view: CalendarView;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (date: Date) => void;
  onCreateAt: (dateKey: string, startMinute: number) => void;
  /** Distinguishes "nothing scheduled" from "your filters hide everything". */
  filtered: boolean;
  /** Offered from the empty state, where it is the only useful next step. */
  onAddSource: () => void;
  /** Your own tasks. Untimed ones ride the all-day row, timed ones the axis. */
  tasks: readonly StudyTask[];
  onToggleTask: (id: string) => void;
}

/** Events and timed tasks share the axis, so they share one layout pass. */
type Placement =
  | { kind: 'event'; event: CalendarEvent; date: string; startTime: string; endTime: string }
  | { kind: 'task'; task: StudyTask; date: string; startTime: string; endTime: string };

const GUTTER_WIDTH = 50;
/** Below this a day column stops being readable, so the grid scrolls instead. */
const MIN_COLUMN_WIDTH = 84;
const SNAP_MINUTES = 30;
/** Rows start a little above the earliest entry so it never hugs the edge. */
const SCROLL_LEAD_MINUTES = 45;

export function WeekGrid({
  days,
  events,
  now,
  view,
  onSelectEvent,
  onSelectDay,
  onCreateAt,
  filtered,
  onAddSource,
  tasks,
  onToggleTask,
}: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hourHeight = view === 'week' ? 64 : 80;
  const pxPerMinute = hourHeight / 60;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneLabel = timeZone.split('/').pop()?.replaceAll('_', ' ') ?? 'Local';

  const timed = events.filter((event) => !event.allDay);
  const allDay = events.filter((event) => event.allDay);

  const untimedTasks = tasks.filter((task) => !task.dueTime);
  // A task has no length, so it borrows a fixed slot purely to be placeable.
  const timedTasks: Placement[] = tasks
    .filter((task): task is StudyTask & { dueTime: string } => Boolean(task.dueTime))
    .map((task) => ({
      kind: 'task',
      task,
      date: task.dueDate,
      startTime: task.dueTime,
      endTime: formatClock(minutesOfDay(task.dueTime) + TASK_SLOT_MINUTES),
    }));

  const placements: Placement[] = [
    ...timed.map<Placement>((event) => ({
      kind: 'event',
      event,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
    })),
    ...timedTasks,
  ];

  // Bounds cover the tasks too, so an 07:00 reminder opens the axis for it.
  const bounds = gridBounds(placements);
  const totalMinutes = bounds.endMinute - bounds.startMinute;
  const bodyHeight = totalMinutes * pxPerMinute;

  const hours: number[] = [];
  for (let minute = bounds.startMinute; minute <= bounds.endMinute; minute += 60) {
    hours.push(minute);
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowVisible =
    nowMinutes >= bounds.startMinute &&
    nowMinutes <= bounds.endMinute &&
    days.some((day) => isSameDay(day, now));
  const nowOffset = (nowMinutes - bounds.startMinute) * pxPerMinute;

  const earliest = timed.length
    ? timed.reduce(
        (value, event) => Math.min(value, minutesOfDay(event.startTime)),
        bounds.endMinute,
      )
    : bounds.startMinute;

  // Opening on an empty 08:00 row when the first lecture is at 11:00 wastes the
  // fold, so the body starts scrolled to whatever the week actually begins with.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const target = Math.min(earliest, nowVisible ? nowMinutes : earliest) - SCROLL_LEAD_MINUTES;
    const headerHeight = (container.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    container.scrollTop = Math.max(0, (target - bounds.startMinute) * pxPerMinute - headerHeight);
    // Deliberately keyed to the view only: re-running on every data change would
    // yank the grid back while someone is scrolling through their day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // A work week cannot shrink forever: past the minimum the grid
  // scrolls sideways under a pinned time gutter rather than turning every
  // lecture into two truncated characters.
  const columnFloor = days.length > 1 ? `${MIN_COLUMN_WIDTH}px` : '0';
  const template = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(${columnFloor}, 1fr))`;
  const gridStyle = {
    gridTemplateColumns: template,
    minWidth: GUTTER_WIDTH + (days.length > 1 ? days.length * MIN_COLUMN_WIDTH : 0),
  };

  const handleColumnClick = (day: Date) => (event: MouseEvent<HTMLButtonElement>) => {
    const { top } = event.currentTarget.getBoundingClientRect();
    const minutesFromTop = (event.clientY - top) / pxPerMinute;
    const snapped = bounds.startMinute + Math.floor(minutesFromTop / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.min(Math.max(snapped, bounds.startMinute), bounds.endMinute - 60);
    onCreateAt(localDateKey(day), clamped);
  };

  return (
    <section
      aria-label={view === 'week' ? 'Week schedule' : 'Day schedule'}
      className="calendar-grid relative flex flex-1 flex-col min-h-0 overflow-hidden"
    >
      <div
        ref={scrollRef}
        className="no-scrollbar relative min-h-[588px] max-h-[calc(100vh-182px)] flex-1 overflow-auto"
        style={{ '--hour-height': `${hourHeight}px` } as CSSProperties}
      >
        <div
          className="calendar-grid-header sticky top-0 z-40 border-b border-[var(--calendar-line)]"
          style={{ minWidth: gridStyle.minWidth }}
        >
          <div className="grid h-10" style={gridStyle}>
            <div className="calendar-grid-header sticky left-0 z-10 flex min-w-0 items-center justify-end px-1.5 text-[10px] text-muted">
              <span className="truncate" title={timeZone}>
                {timeZoneLabel}
              </span>
            </div>
            {days.map((day) => {
              const today = isSameDay(day, now);
              return (
                <div
                  key={localDateKey(day)}
                  className="group/day relative flex items-center justify-center"
                >
                  <button
                    type="button"
                    aria-label={`Show ${formatDayLabel(day)}`}
                    aria-current={today ? 'date' : undefined}
                    onClick={() => onSelectDay(day)}
                    className={cn(
                      'flex items-center gap-1 rounded-md text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4',
                      today
                        ? 'font-semibold text-primary'
                        : 'font-medium text-secondary hover:text-primary',
                    )}
                  >
                    <span>{WEEKDAY_SHORT[weekdayIndex(day)]}</span>
                    <span
                      className={cn(
                        'grid h-6 min-w-6 place-items-center rounded-md tabular-nums',
                        today && 'bg-[var(--calendar-today)] px-1.5 font-medium text-white',
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                  <IconButton
                    label={`Add an event on ${formatDayLabel(day)}`}
                    size="sm"
                    onClick={() => onCreateAt(localDateKey(day), Math.max(bounds.startMinute, 540))}
                    className="absolute right-0 top-0 h-5 w-5 rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover/day:opacity-100"
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                  </IconButton>
                </div>
              );
            })}
          </div>

          <div className="grid border-t border-[var(--calendar-line)]" style={gridStyle}>
            <div className="calendar-grid-header sticky left-0 z-10 flex items-center justify-end px-1.5 text-[11px] text-muted">
              All day
            </div>
            {days.map((day) => {
              const key = localDateKey(day);
              const chips = allDay.filter((event) => event.date === key);
              const dayTasks = untimedTasks.filter((task) => task.dueDate === key);
              return (
                <div
                  key={key}
                  className={cn(
                    'flex min-h-[20px] flex-col gap-0.5 p-0.5',
                    day === days[0] && 'border-l border-[var(--calendar-line)]',
                    weekdayIndex(day) > 4 && 'bg-[var(--calendar-weekend)]',
                  )}
                >
                  {chips.map((event) => (
                    <AllDayEventChip key={event.id} event={event} onSelect={onSelectEvent} />
                  ))}
                  {dayTasks.map((task) => (
                    <TaskChip key={task.id} task={task} onToggle={onToggleTask} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid" style={gridStyle}>
          <div className="calendar-grid-header sticky left-0 z-35" style={{ height: bodyHeight }}>
            {hours.map((minute, index) => (
              <span
                key={minute}
                aria-hidden
                className={cn(
                  'absolute right-1.5 text-[11px] tabular-nums text-muted',
                  index > 0 && '-translate-y-1/2',
                )}
                style={{ top: (minute - bounds.startMinute) * pxPerMinute }}
              >
                {formatClock(minute)}
              </span>
            ))}
            {nowVisible ? (
              <span
                className="absolute right-1 z-10 -translate-y-1/2 rounded bg-[var(--calendar-today)] px-1 py-0.5 text-[10px] font-medium tabular-nums text-white"
                style={{ top: nowOffset }}
              >
                <span className="sr-only">Current time </span>
                {formatClock(nowMinutes)}
              </span>
            ) : null}
          </div>

          {days.map((day) => {
            const key = localDateKey(day);
            const today = isSameDay(day, now);
            const placed = layoutDayEvents(placements.filter((item) => item.date === key));

            return (
              <div
                key={key}
                className={cn(
                  'time-grid-lines relative isolate border-l border-[var(--calendar-line)]',
                  weekdayIndex(day) > 4 && 'bg-[var(--calendar-weekend)]',
                )}
                style={{ height: bodyHeight }}
              >
                {/* Pointer affordance only. The keyboard route to the same
                    action is the "Add an event" button in each day header. */}
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={handleColumnClick(day)}
                  className="absolute inset-0 h-full w-full cursor-copy"
                />

                {placed.map(({ event: item, startMinute, endMinute, column, columns }) =>
                  item.kind === 'task' ? (
                    <TimedTaskCard
                      key={item.task.id}
                      task={item.task}
                      onToggle={onToggleTask}
                      startMinute={startMinute}
                      endMinute={endMinute}
                      column={column}
                      columns={columns}
                      gridStart={bounds.startMinute}
                      pxPerMinute={pxPerMinute}
                    />
                  ) : (
                    <CalendarEventCard
                      key={item.event.id}
                      event={item.event}
                      startMinute={startMinute}
                      endMinute={endMinute}
                      column={column}
                      columns={columns}
                      gridStart={bounds.startMinute}
                      pxPerMinute={pxPerMinute}
                      detailed={view === 'day'}
                      live={
                        today &&
                        item.event.status !== 'cancelled' &&
                        nowMinutes >= startMinute &&
                        nowMinutes < endMinute
                      }
                      onSelect={onSelectEvent}
                    />
                  ),
                )}

                {today && nowVisible ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-30"
                    style={{ top: nowOffset }}
                  >
                    <span className="absolute -left-[3px] -top-[3px] block h-1.5 w-1.5 rounded-full bg-[var(--calendar-today)]" />
                    <span className="block h-px bg-[var(--calendar-today)]" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sits over the scroller, not inside it: an absolute child of a scroll
          container is positioned against the whole scrollable canvas, which
          would push this message below the fold on a tall, empty grid. */}
      {events.length === 0 && tasks.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[67px] flex flex-col items-center justify-center px-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface text-muted shadow-soft">
            <CalendarOff size={19} strokeWidth={1.5} aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-medium text-primary">
            {filtered ? 'Nothing matches these filters' : 'Nothing scheduled'}
          </p>
          <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-secondary">
            {filtered
              ? 'Clear a filter to see the rest of the week.'
              : 'Subscribe to your timetable and it fills itself in, or add an event by hand.'}
          </p>
          {filtered ? null : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onAddSource}
              leadingIcon={<Rss size={14} strokeWidth={1.8} aria-hidden />}
              className="pointer-events-auto mt-3"
            >
              Add your timetable
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
