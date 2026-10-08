import { Check, ListTodo, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Assignment } from '@/features/dashboard/lib/types';

interface AssignmentsCardProps {
  assignments: Assignment[];
  onToggleAssignment: (id: string) => void;
  onAddAssignment: () => void;
}

export function AssignmentsCard({
  assignments,
  onToggleAssignment,
  onAddAssignment,
}: AssignmentsCardProps) {
  const remaining = assignments.filter((assignment) => !assignment.completed).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <ListTodo size={18} strokeWidth={1.7} className="text-muted" />
          <h2 className="text-[16px] font-semibold tracking-tight">My assignments</h2>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
            {remaining} to do
          </span>
        </div>
        <Link to="/tasks" className="text-[11px] text-secondary hover:text-accent">
          View all
        </Link>
      </div>
      <div className="mx-5 flex justify-between border-b border-line-soft pb-2 text-[9px] font-medium uppercase tracking-[0.08em] text-muted">
        <span>Assignment</span>
        <span>Progress</span>
      </div>
      <div className="px-3">
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className={cn(
              'flex items-center gap-3 rounded-xl px-2 py-4 transition-colors hover:bg-surface-secondary',
              assignment.completed && 'opacity-60',
            )}
          >
            <button
              type="button"
              aria-pressed={assignment.completed}
              onClick={() => onToggleAssignment(assignment.id)}
              aria-label={`Mark ${assignment.title} as ${assignment.completed ? 'incomplete' : 'complete'}`}
              className={cn(
                'grid h-5 w-5 flex-none place-items-center rounded-[6px] border transition-colors',
                assignment.completed
                  ? 'border-accent bg-accent text-white'
                  : 'border-line-strong hover:border-accent hover:bg-accent-soft',
              )}
            >
              {assignment.completed && <Check size={12} strokeWidth={2.5} />}
            </button>
            <div className="min-w-0 flex-1">
              <h3
                className={cn('text-[12.5px] font-medium', assignment.completed && 'line-through')}
              >
                {assignment.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                <span>{assignment.course}</span>
                <span aria-hidden>·</span>
                <span
                  className={
                    assignment.priority === 'high' && !assignment.completed
                      ? 'text-[#b48260] dark:text-orange'
                      : ''
                  }
                >
                  {assignment.due}
                </span>
              </div>
            </div>
            <div className="w-16 flex-none text-right sm:w-20">
              <span className="text-[10px] font-medium tabular-nums text-secondary">
                {assignment.completed ? 100 : assignment.progress}%
              </span>
              <div
                role="progressbar"
                aria-label={`${assignment.title} progress`}
                aria-valuenow={assignment.completed ? 100 : assignment.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover"
              >
                <div
                  className="h-full rounded-full bg-accent/70 transition-[width] duration-300"
                  style={{ width: `${assignment.completed ? 100 : assignment.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAddAssignment}
        className="flex w-full items-center gap-2 border-t border-line-soft px-5 py-3 text-[11px] font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent"
      >
        <Plus size={15} strokeWidth={1.7} />
        Add assignment
      </button>
    </section>
  );
}
