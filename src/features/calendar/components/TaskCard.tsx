import { Check } from 'lucide-react';
import { formatDayLabel, parseDateKey } from '@/lib/date';
import { TONE_EVENT } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { toneFor } from '@/features/calendar/lib/icsMapping';
import type { StudyTask } from '@/features/calendar/lib/agenda';

/** A task with a time gets this much room on the axis; it has no real length. */
export const TASK_SLOT_MINUTES = 30;

interface TaskVisualProps {
  task: StudyTask;
  onToggle: (id: string) => void;
}

function surfaceFor(task: StudyTask) {
  // Course colour when the task belongs to one, so the grid reads as a whole.
  // Otherwise a neutral fill, which keeps private errands from impersonating
  // a lecture.
  if (!task.courseCode) {
    return { surface: 'bg-surface-secondary', edge: 'border-line', ink: 'text-secondary' };
  }
  const tone = TONE_EVENT[toneFor(task.courseCode, 'lecture')];
  return { surface: tone.surface, edge: tone.edge, ink: tone.ink };
}

function Circle({ done, className }: { done: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid flex-none place-items-center rounded-full border-[1.5px] transition-colors',
        done ? 'border-green bg-green text-inverted' : 'border-current opacity-70',
        className,
      )}
    >
      {done ? <Check size={8} strokeWidth={3.5} /> : null}
    </span>
  );
}

/**
 * A task without a time, pinned in the all-day row.
 *
 * The whole chip is the toggle. On a calendar a circle next to a title reads
 * as "tick me", and splitting it into a checkbox plus an inert label would put
 * two thirds of the target out of reach.
 */
export function TaskChip({ task, onToggle }: TaskVisualProps) {
  const style = surfaceFor(task);

  return (
    <button
      type="button"
      aria-pressed={task.done}
      aria-label={`${task.title}, task on ${formatDayLabel(parseDateKey(task.dueDate))}`}
      onClick={() => onToggle(task.id)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left',
        'transition duration-150 hover:shadow-soft focus-visible:outline-2',
        style.surface,
        style.edge,
        task.done && 'opacity-60',
      )}
    >
      <Circle done={task.done} className={cn('h-3 w-3', style.ink)} />
      <span
        className={cn(
          'truncate text-[10.5px] font-medium leading-tight text-primary',
          task.done && 'line-through',
        )}
      >
        {task.title}
      </span>
    </button>
  );
}

interface TimedTaskCardProps extends TaskVisualProps {
  startMinute: number;
  endMinute: number;
  column: number;
  columns: number;
  gridStart: number;
  pxPerMinute: number;
}

/** A task that named a time, placed on the axis alongside the lectures. */
export function TimedTaskCard({
  task,
  onToggle,
  startMinute,
  endMinute,
  column,
  columns,
  gridStart,
  pxPerMinute,
}: TimedTaskCardProps) {
  const style = surfaceFor(task);
  const height = Math.max(20, (endMinute - startMinute) * pxPerMinute);
  const width = 100 / columns;

  return (
    <button
      type="button"
      aria-pressed={task.done}
      aria-label={`${task.title}, task, ${formatDayLabel(parseDateKey(task.dueDate))} at ${task.dueTime ?? ''}`}
      onClick={() => onToggle(task.id)}
      style={{
        top: (startMinute - gridStart) * pxPerMinute,
        height,
        left: `calc(${column * width}% + 2px)`,
        width: `calc(${width}% - 5px)`,
        zIndex: 10 + column,
      }}
      className={cn(
        'absolute flex items-start gap-1.5 overflow-hidden rounded-lg border px-1.5 py-1 text-left',
        'transition duration-150 hover:z-30 hover:shadow-soft focus-visible:outline-2',
        style.surface,
        style.edge,
        task.done && 'opacity-60',
      )}
    >
      <Circle done={task.done} className={cn('mt-px h-3 w-3', style.ink)} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[11px] font-semibold leading-tight text-primary',
            task.done && 'line-through',
          )}
        >
          {task.title}
        </span>
        {height >= 34 ? (
          <span className="block truncate text-[10px] leading-tight text-primary/70 tabular-nums">
            {task.dueTime}
          </span>
        ) : null}
      </span>
    </button>
  );
}
