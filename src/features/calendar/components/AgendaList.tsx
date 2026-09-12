import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarClock,
  Check,
  ClipboardCheck,
  LayoutGrid,
  ListChecks,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { localDateKey } from '@/lib/date';
import { TONE_EVENT } from '@/lib/tone';
import { cn } from '@/lib/utils';
import {
  buildAgenda,
  formatDue,
  PRIORITY_LABELS,
  type AgendaEntry,
  type AgendaSource,
  type TaskPriority,
} from '@/features/calendar/lib/agenda';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import type { CalendarEvent } from '@/features/calendar/lib/types';

interface AgendaListProps {
  /** Everything on the calendar; exams and deadlines are picked out of it. */
  events: readonly CalendarEvent[];
  now: Date;
}

type Filter = 'all' | AgendaSource;

const FILTER_LABELS: Record<AgendaSource, string> = {
  task: 'Tasks',
  exam: 'Exams',
  deadline: 'Due',
};

/**
 * Priority as a dot rather than a chip.
 *
 * The old chip put 9.5px uppercase text on a tinted fill, which measured near
 * 2:1 and was the loudest thing in a row while carrying the least. A dot is a
 * graphic, judged against a gentler contrast rule, and every dot is paired
 * with text for screen readers so the meaning is never colour alone.
 */
const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-coral',
  med: 'bg-orange',
  low: 'bg-teal',
};

const SOURCE_ICON: Record<AgendaSource, LucideIcon | null> = {
  task: null,
  exam: ClipboardCheck,
  deadline: CalendarClock,
};

/** Icon per filter pill. Reuses SOURCE_ICON's choices for exam/deadline so the
 * pill and the row it filters to read as the same category. */
const FILTER_ICON: Record<Filter, LucideIcon> = {
  all: LayoutGrid,
  task: ListChecks,
  exam: ClipboardCheck,
  deadline: CalendarClock,
};

/** Fixed and always offered, so the control doesn't jump around as your list fills in. */
const FILTERS: readonly Filter[] = ['all', 'task', 'exam', 'deadline'];

export function AgendaList({ events, now }: AgendaListProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const toggleTask = useTaskStore((state) => state.toggleTask);
  const removeTask = useTaskStore((state) => state.removeTask);

  const [filter, setFilter] = useState<Filter>('all');
  const [composing, setComposing] = useState(false);

  const buckets = useMemo(() => buildAgenda(tasks, events, now), [tasks, events, now]);

  const shown = useMemo(
    () =>
      buckets
        .map((bucket) => ({
          ...bucket,
          entries: bucket.entries.filter((entry) => filter === 'all' || entry.source === filter),
        }))
        .filter((bucket) => bucket.entries.length > 0),
    [buckets, filter],
  );

  return (
    <section aria-label="Tasks and deadlines" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold tracking-tight text-primary">Agenda</h3>
        <button
          type="button"
          aria-label="Add task"
          aria-expanded={composing}
          onClick={() => setComposing((previous) => !previous)}
          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-secondary transition-colors hover:border-line-strong hover:bg-surface-secondary hover:text-primary"
        >
          <Plus size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      <div role="group" aria-label="Filter the list" className="mt-2.5 flex items-center gap-1.5">
        {/* 'all' always leads; only the active pill expands to show its label. */}
        {FILTERS.map((option) => {
          const Icon = FILTER_ICON[option];
          const active = filter === option;
          const label = option === 'all' ? 'All' : FILTER_LABELS[option];

          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              aria-label={label}
              onClick={() => setFilter(option)}
              className={cn(
                'flex h-7 flex-none items-center justify-center gap-1.5 rounded-full border px-3.5 transition-colors',
                active
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-line text-secondary hover:border-line-strong hover:text-primary',
              )}
            >
              <Icon size={13} strokeWidth={2.1} aria-hidden />
              {active ? <span className="text-[11px] font-medium">{label}</span> : null}
            </button>
          );
        })}
      </div>

      {composing ? (
        <TaskComposer
          today={localDateKey(now)}
          onClose={() => setComposing(false)}
          onAdd={addTask}
        />
      ) : null}

      <div className="no-scrollbar mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {shown.map((bucket) => (
          <div key={bucket.id}>
            <div className="flex items-center gap-2">
              <h4
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.07em]',
                  bucket.id === 'overdue' ? 'text-danger' : 'text-secondary',
                )}
              >
                {bucket.label}
              </h4>
              <span aria-hidden className="h-px flex-1 bg-line-soft" />
            </div>

            <ul className="mt-1.5 flex flex-col gap-0.5">
              {bucket.entries.map((entry) => (
                <li key={entry.id}>
                  <AgendaRow
                    entry={entry}
                    now={now}
                    overdue={bucket.id === 'overdue'}
                    onToggle={toggleTask}
                    onRemove={removeTask}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11.5px] leading-relaxed text-secondary">
            {filter === 'all'
              ? 'Nothing due. Add a task, or subscribe to a timetable and its exams land here.'
              : 'Nothing in this filter.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface AgendaRowProps {
  entry: AgendaEntry;
  now: Date;
  overdue: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function AgendaRow({ entry, now, overdue, onToggle, onRemove }: AgendaRowProps) {
  const tone = TONE_EVENT[entry.tone];
  const isTask = entry.source === 'task';
  const Icon = SOURCE_ICON[entry.source];
  const due = formatDue(entry, now);

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2.5 rounded-xl border border-transparent px-2 py-1.5',
        'transition-colors hover:border-line-soft hover:bg-surface-secondary/60',
        entry.done && 'opacity-60',
      )}
    >
      {isTask ? (
        <button
          type="button"
          aria-label={`Toggle ${entry.title}`}
          aria-pressed={entry.done}
          onClick={() => onToggle(entry.id)}
          className={cn(
            'mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-md border transition-colors',
            entry.done
              ? 'border-green bg-green text-inverted'
              : 'border-line-strong bg-surface group-hover:border-accent',
          )}
        >
          {entry.done ? <Check size={10} strokeWidth={3} aria-hidden /> : null}
        </button>
      ) : (
        // Not a checkbox: an exam happens whether or not you tick it.
        <span
          aria-hidden
          className={cn('mt-0.5 grid h-4 w-4 flex-none place-items-center', tone.ink)}
        >
          {Icon ? <Icon size={13} strokeWidth={1.9} /> : null}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'line-clamp-2 text-[12.5px] font-medium leading-snug text-primary',
            entry.done && 'text-muted line-through',
          )}
        >
          {entry.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-tight">
          {entry.priority ? (
            <>
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 flex-none rounded-full', PRIORITY_DOT[entry.priority])}
              />
              <span className="sr-only">{PRIORITY_LABELS[entry.priority]}</span>
            </>
          ) : null}
          <span className={cn('truncate', overdue ? 'font-medium text-danger' : 'text-secondary')}>
            {due}
          </span>
          {entry.room ? <span className="truncate text-secondary">· {entry.room}</span> : null}
          {!isTask ? (
            <span className="truncate text-secondary">
              · {entry.source === 'exam' ? 'Exam' : 'Deadline'}
            </span>
          ) : null}
        </p>
      </div>

      {isTask ? (
        <button
          type="button"
          aria-label={`Delete ${entry.title}`}
          onClick={() => onRemove(entry.id)}
          // Hidden until hover, but never hidden from the keyboard.
          className="mt-0.5 flex-none rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:text-coral focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={12} strokeWidth={1.8} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

interface TaskComposerProps {
  /** Same clock the list buckets by, so a new task never starts overdue. */
  today: string;
  onClose: () => void;
  onAdd: (input: {
    title: string;
    dueDate: string;
    dueTime: string | null;
    priority: TaskPriority;
    courseCode: string | null;
  }) => unknown;
}

const PRIORITIES: readonly TaskPriority[] = ['high', 'med', 'low'];

function TaskComposer({ today, onClose, onAdd }: TaskComposerProps) {
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('med');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    // An empty time is the normal case: the task belongs to the day, not to a
    // slot, and the week view pins it in the all-day row.
    onAdd({ title: trimmed, dueDate, dueTime: dueTime || null, priority, courseCode: null });
    setTitle('');
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-line-soft p-2">
      <label htmlFor={titleId} className="sr-only">
        Task
      </label>
      <input
        id={titleId}
        type="text"
        autoFocus
        placeholder="What needs to be done?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full rounded-lg border border-line bg-surface-secondary px-2.5 py-1.5 text-[12px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
      />

      <div className="mt-2 flex items-center gap-1.5">
        <label htmlFor={dateId} className="sr-only">
          Due date
        </label>
        <input
          id={dateId}
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-secondary px-2 py-1 text-[11px] text-primary focus:border-accent focus:outline-none"
        />
        <label htmlFor={timeId} className="sr-only">
          Time, optional
        </label>
        <input
          id={timeId}
          type="time"
          value={dueTime}
          onChange={(event) => setDueTime(event.target.value)}
          className="w-[74px] flex-none rounded-lg border border-line bg-surface-secondary px-1.5 py-1 text-[11px] text-primary focus:border-accent focus:outline-none"
        />
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-secondary">
        {dueTime ? 'Shows on the week grid at that time.' : 'No time: sits in the all-day row.'}
      </p>

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <div role="group" aria-label="Priority" className="flex items-center gap-0.5">
          {PRIORITIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={priority === option}
              aria-label={PRIORITY_LABELS[option]}
              onClick={() => setPriority(option)}
              className={cn(
                'grid h-6 w-6 place-items-center rounded-lg border transition-colors',
                priority === option ? 'border-accent bg-accent-soft' : 'border-transparent',
              )}
            >
              <span aria-hidden className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[option])} />
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground transition-opacity disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </form>
  );
}
