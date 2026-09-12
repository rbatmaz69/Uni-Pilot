import { useState } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DeadlineItem {
  id: string;
  title: string;
  due: string;
  priority: 'high' | 'med' | 'low';
  done?: boolean;
}

const INITIAL_DEADLINES: DeadlineItem[] = [
  {
    id: 'd1',
    title: 'Database Assignment',
    due: 'Due tomorrow · 23:59',
    priority: 'high',
  },
  {
    id: 'd2',
    title: 'UX Case Study',
    due: 'In 3 days',
    priority: 'med',
  },
  {
    id: 'd3',
    title: 'Exam Registration',
    due: 'In 5 days',
    priority: 'high',
  },
];

export function DeadlinesCard() {
  const [items, setItems] = useState(INITIAL_DEADLINES);

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold tracking-tight text-primary">Deadlines</h2>
        <Link
          to="/tasks"
          className="text-[12.5px] font-medium text-secondary hover:text-primary transition-colors"
        >
          View all
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {items.map((item) => (
          <div
            key={item.id}

            className={cn(
              'group flex items-start gap-3 rounded-xl border border-transparent p-2.5 transition-all duration-150',
              'hover:border-line-soft hover:bg-surface-secondary/70',
              item.done && 'opacity-60',
            )}
          >
            <button
              type="button"
              aria-label={`Toggle ${item.title}`}
              aria-pressed={!!item.done}
              onClick={() => toggleItem(item.id)}
              className={cn(
                'mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border transition-colors',
                item.done
                  ? 'border-green bg-green text-surface'
                  : 'border-line-strong bg-surface group-hover:border-primary',
              )}
            >
              {item.done ? <Check size={12} strokeWidth={2.5} /> : null}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-[13.5px] font-semibold text-primary',
                    item.done && 'line-through text-muted',
                  )}
                >
                  {item.title}
                </span>

                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider',
                    item.priority === 'high'
                      ? 'bg-pink-soft text-pink-700 border border-pink/30'
                      : 'bg-yellow-soft text-yellow-800 border border-yellow/30',
                  )}
                >
                  {item.priority}
                </span>
              </div>

              <span className="mt-0.5 block text-[11.5px] text-muted">{item.due}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
