import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Assignment } from '@/features/dashboard/lib/types';

interface AddAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (assignment: Assignment) => void;
}

export function AddAssignmentModal({ isOpen, onClose, onAdd }: AddAssignmentModalProps) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('Programming II');
  const [due, setDue] = useState('Due in 4 days');
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('high');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAdd({
      id: `a-${Date.now()}`,
      title: title.trim(),
      course,
      due,
      progress: 0,
      completed: false,
      priority,
      progressTone: priority === 'high' ? 'coral' : 'yellow',
    });

    setTitle('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add assignment"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm animate-page-enter"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-line-soft bg-surface p-6 shadow-raised">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add assignment modal"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-[18px] font-bold tracking-tight text-primary">Add Assignment</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Create a new task to keep your momentum.</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-semibold text-secondary mb-1">
              Assignment Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lab 5 - Binary Trees"
              className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3.5 py-2 text-[13.5px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-secondary mb-1">Module</label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3 py-2 text-[13px] text-primary focus:border-accent focus:outline-none"
              >
                <option value="Programming II">Programming II</option>
                <option value="Database Systems">Database Systems</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="HCI">HCI</option>
                <option value="Mathematics II">Mathematics II</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-secondary mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'med' | 'low')}
                className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3 py-2 text-[13px] text-primary focus:border-accent focus:outline-none"
              >
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-secondary mb-1">Due Date</label>
            <input
              type="text"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              placeholder="e.g. Due tomorrow · 23:59"
              className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3.5 py-2 text-[13.5px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save assignment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
