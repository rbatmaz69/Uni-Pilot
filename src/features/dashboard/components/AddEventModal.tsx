import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { localDateKey } from '@/lib/date';
import type { AgendaEvent } from '@/features/dashboard/lib/types';

interface AddEventModalProps {
  initialDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (event: AgendaEvent) => void;
}

export function AddEventModal({ isOpen, onClose, onAdd, initialDate }: AddEventModalProps) {
  const [date, setDate] = useState(initialDate ?? localDateKey(new Date()));
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [room, setRoom] = useState('A 312');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAdd({
      id: `e-${Date.now()}`,
      title: title.trim(),
      date,
      startTime,
      endTime,
      room,
      tone: 'blue',
    });

    setTitle('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add event to agenda"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm animate-page-enter"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-line-soft bg-surface p-6 shadow-raised">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add event modal"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-[18px] font-bold tracking-tight text-primary">Add Event</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Add a lecture, lab, or study group meeting.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className="text-[12px] font-semibold text-secondary">
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-primary"
            />
          </label>
          <div>
            <label className="block text-[12px] font-semibold text-secondary mb-1">
              Event Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Algorithms Tutorial"
              className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3.5 py-2 text-[13.5px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-secondary mb-1">
                Start Time
              </label>
              <input
                type="time"
                aria-label="Start time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3 py-2 text-[13px] text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-secondary mb-1">
                End Time
              </label>
              <input
                type="time"
                aria-label="End time"
                required
                min={startTime}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3 py-2 text-[13px] text-primary focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-secondary mb-1">
              Room / Location
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. C 04 or Zoom"
              className="w-full rounded-xl border border-line-soft bg-surface-secondary px-3.5 py-2 text-[13.5px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save event
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
