import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  formatDayLabel,
  formatWeekRange,
  isoWeekNumber,
  localDateKey,
  minutesOfDay,
  MONTH_NAMES,
  parseDateKey,
  relativeDayLabel,
  relativeWeekLabel,
  startOfDay,
  startOfWeek,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '@/lib/date';
import { CalendarRightPanel } from './CalendarRightPanel';
import { CalendarSourcesDialog } from './CalendarSourcesDialog';
import { CalendarToolbar, type KindFilterOption, type WeekSummary } from './CalendarToolbar';
import { EventComposerDialog, type EventDraft } from './EventComposerDialog';
import { EventDetailsDialog } from './EventDetailsDialog';
import { mergeEvents } from '@/features/calendar/lib/icsMapping';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useSourceStore, type CalendarSource } from '@/features/calendar/store/sourceStore';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import {
  EVENT_KIND_ORDER,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarView,
} from '@/features/calendar/lib/types';
import { WeekGrid } from './WeekGrid';

const MINUTE = 60_000;
const DEFAULT_NEW_EVENT_TIME = '09:00';

/**
 * Holds everything the calendar screen needs.
 *
 * A single `focusDay` drives both views: the week strip is derived from its
 * Monday, the day view is the day itself. Keeping one date in state means the
 * two views can never disagree about where the user is.
 */
export function CalendarWorkspace() {
  const [now, setNow] = useState(() => new Date());
  const [focusDay, setFocusDay] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<CalendarView>('week');
  const ownEvents = useEventStore((state) => state.events);
  const [activeKinds, setActiveKinds] = useState<ReadonlySet<CalendarEventKind>>(() => new Set());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  /** Ids struck off the grid. Generated sample entries are removable too. */
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());

  const sources = useSourceStore((state) => state.sources);
  const refreshStale = useSourceStore((state) => state.refreshStale);
  const tasks = useTaskStore((state) => state.tasks);
  const toggleTask = useTaskStore((state) => state.toggleTask);

  // The now-line and every countdown stay honest without re-rendering per second.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(timer);
  }, []);

  // Subscriptions are cached, so the grid draws instantly and catches up after.
  useEffect(() => refreshStale(), [refreshStale]);

  const events = useMemo(
    () =>
      mergeEvents(...sources.map((source) => source.events), ownEvents).filter(
        (event) => !hiddenIds.has(event.id),
      ),
    [sources, ownEvents, hiddenIds],
  );

  // Memoised so these derived dates keep their identity between renders: a
  // fresh Date on every pass would invalidate every list built from them.
  const anchor = useMemo(() => startOfWeek(focusDay), [focusDay]);
  const days = useMemo(
    () =>
      view === 'week'
        ? Array.from({ length: 5 }, (_, index) => addDays(anchor, index))
        : [focusDay],
    [view, focusDay, anchor],
  );

  const inRange = useMemo(() => {
    const keys = new Set(days.map(localDateKey));
    return events.filter((event) => keys.has(event.date));
  }, [days, events]);

  // Only the kinds actually in view get a chip, plus any that are switched on:
  // an active filter that disappeared on the way to a quieter week would leave
  // an empty grid with nothing to switch back off.
  const filters: KindFilterOption[] = useMemo(
    () =>
      EVENT_KIND_ORDER.map((kind) => ({
        kind,
        count: inRange.filter((event) => event.kind === kind).length,
      })).filter((option) => option.count > 0 || activeKinds.has(option.kind)),
    [inRange, activeKinds],
  );

  const visible = useMemo(
    () => (activeKinds.size ? inRange.filter((event) => activeKinds.has(event.kind)) : inRange),
    [inRange, activeKinds],
  );

  const visibleTasks = useMemo(() => (activeKinds.size === 0 ? tasks : []), [tasks, activeKinds]);

  const summary: WeekSummary = useMemo(() => {
    const sessions = visible.filter((event) => !event.allDay);
    return {
      sessions: sessions.length,
      contactMinutes: sessions
        .filter((event) => event.status !== 'cancelled')
        .reduce(
          (total, event) => total + minutesOfDay(event.endTime) - minutesOfDay(event.startTime),
          0,
        ),
      nextDeadline: describeNextDeadline(events, now),
    };
  }, [visible, events, now]);

  const step = view === 'week' ? 7 : 1;
  const goTo = (date: Date) => {
    setFocusDay(startOfDay(date));
    setSelected(null);
  };

  const openComposer = (date: string, startMinute: number) => {
    const hours = Math.floor(startMinute / 60);
    const minutes = startMinute % 60;
    setDraft({
      date,
      startTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    });
  };

  const addEvent = (event: CalendarEvent) => {
    useEventStore.getState().add(event);
    // Land on whatever was just created, even if it was filed on another day
    // or under a kind the current filter hides.
    setFocusDay(startOfDay(parseDateKey(event.date)));
    setActiveKinds((previous) =>
      previous.size && !previous.has(event.kind) ? new Set() : previous,
    );
  };

  // Only entries this app owns can be deleted. Removing one occurrence of a
  // subscribed lecture would be undone by the next sync, so the detail dialog
  // offers the source instead of a delete button.
  const removeEvent = (id: string) => {
    useEventStore.getState().remove(id);
    setHiddenIds((previous) => new Set(previous).add(id));
    setSelected(null);
  };

  /**
   * A timetable usually starts in a future week, so landing on an empty grid
   * after a successful import reads as a failure. If nothing from the new
   * source falls in view, the calendar moves to its first upcoming entry.
   */
  const showSource = (source: CalendarSource) => {
    const visible = new Set(days.map(localDateKey));
    if (source.events.some((event) => visible.has(event.date))) return;

    const todayKey = localDateKey(new Date());
    const upcoming = source.events
      .filter((event) => event.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const landing = upcoming ?? source.events[0];

    if (landing) setFocusDay(startOfDay(parseDateKey(landing.date)));
  };

  const toggleKind = (kind: CalendarEventKind) => {
    setActiveKinds((previous) => {
      const next = new Set(previous);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  };

  const dialogOpen = selected !== null || draft !== null || sourcesOpen;

  useEffect(() => {
    if (dialogOpen) return;

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
      const target = keyEvent.target;
      // Never steal a keystroke that someone is typing into a field.
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable]')
      ) {
        return;
      }

      const shortcuts: Record<string, () => void> = {
        arrowleft: () => setFocusDay((day) => addDays(day, -step)),
        arrowright: () => setFocusDay((day) => addDays(day, step)),
        t: () => setFocusDay(startOfDay(new Date())),
        w: () => setView('week'),
        d: () => setView('day'),
        n: () => openComposer(localDateKey(focusDay), minutesOfDay(DEFAULT_NEW_EVENT_TIME)),
      };

      const run = shortcuts[keyEvent.key.toLowerCase()];
      if (!run) return;
      keyEvent.preventDefault();
      run();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen, step, focusDay]);

  return (
    <div className="flex flex-1 gap-0 min-h-0 mr-0 lg:-mr-5 xl:-mr-6">
      {/* Left box: Wochenansicht-Box mit eigenem border-radius */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-surface min-w-0 min-h-0">
        <CalendarToolbar
          monthLabel={`${MONTH_NAMES[focusDay.getMonth()]} ${focusDay.getFullYear()}`}
          rangeLabel={view === 'week' ? formatWeekRange(anchor) : formatDayLabel(focusDay)}
          relativeLabel={
            view === 'week'
              ? relativeWeekLabel(anchor, now)
              : (relativeDayLabel(focusDay, now) ?? relativeWeekLabel(anchor, now))
          }
          weekNumber={isoWeekNumber(focusDay)}
          view={view}
          summary={summary}
          filters={filters}
          activeKinds={activeKinds}
          onViewChange={setView}
          onPrevious={() => goTo(addDays(focusDay, -step))}
          onNext={() => goTo(addDays(focusDay, step))}
          onToday={() => goTo(new Date())}
          onToggleKind={toggleKind}
          onClearFilters={() => setActiveKinds(new Set())}
          onNewEvent={() =>
            openComposer(localDateKey(focusDay), minutesOfDay(DEFAULT_NEW_EVENT_TIME))
          }
          onOpenSources={() => setSourcesOpen(true)}
          sourceCount={sources.length}
        />

        <WeekGrid
          days={days}
          events={visible}
          now={now}
          view={view}
          filtered={activeKinds.size > 0}
          onSelectEvent={setSelected}
          onSelectDay={(day) => {
            setFocusDay(day);
            setView('day');
          }}
          onCreateAt={openComposer}
          onAddSource={() => setSourcesOpen(true)}
          tasks={visibleTasks}
          onToggleTask={toggleTask}
        />
      </div>

      {/* Right box: Monatsansicht + To-Dos mit rounded-l und rechts KEINE border line */}
      <div className="w-[290px] 2xl:w-[320px] flex-none hidden lg:flex flex-col min-h-0">
        <CalendarRightPanel
          focusDay={focusDay}
          onSelectDate={(day) => {
            setFocusDay(startOfDay(day));
          }}
          events={events}
          now={now}
        />
      </div>

      <EventDetailsDialog
        event={selected}
        now={now}
        sourceName={sources.find((source) => source.id === selected?.sourceId)?.name ?? null}
        onClose={() => setSelected(null)}
        onRemove={removeEvent}
      />

      <CalendarSourcesDialog
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        onSourceAdded={showSource}
      />

      {draft ? (
        <EventComposerDialog
          key={`${draft.date}T${draft.startTime}`}
          draft={draft}
          onClose={() => setDraft(null)}
          onSubmit={addEvent}
        />
      ) : null}
    </div>
  );
}

/** "Wed 23:59" for anything this week, otherwise "12 Oct". */
function describeNextDeadline(events: readonly CalendarEvent[], now: Date): string | null {
  const upcoming = events
    .filter((event) => event.kind === 'deadline' || event.kind === 'exam')
    .map((event) => {
      const at = parseDateKey(event.date);
      at.setMinutes(minutesOfDay(event.startTime));
      return { event, at };
    })
    .filter((entry) => entry.at.getTime() >= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  if (!upcoming) return null;

  const relative = relativeDayLabel(upcoming.at, now);
  const day = relative ?? WEEKDAY_SHORT[weekdayIndex(upcoming.at)] ?? '';
  return `${day} ${upcoming.event.startTime}`;
}
