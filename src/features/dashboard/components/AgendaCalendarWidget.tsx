import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localDateKey } from '@/lib/date';
import type { AgendaEvent } from '@/features/dashboard/lib/types';

interface AgendaCalendarWidgetProps {
  events: AgendaEvent[];
  onAddEvent: (date: string) => void;
}

export function AgendaCalendarWidget({ events, onAddEvent }: AgendaCalendarWidgetProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const todayKey = localDateKey(new Date());
  const selectedKey = localDateKey(selectedDate);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const dayEvents = events
    .filter((event) => (event.date ?? todayKey) === selectedKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const changeMonth = (direction: number) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    setMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold tracking-tight">
          {month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
            className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-secondary"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
            className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-secondary"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-[9px] text-muted">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[11px] tabular-nums">
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const key = localDateKey(date);
          const selected = key === selectedKey;
          const hasEvents = events.some((event) => (event.date ?? todayKey) === key);
          return (
            <button
              key={key}
              type="button"
              aria-label={date.toLocaleDateString('en', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              aria-pressed={selected}
              aria-current={key === todayKey ? 'date' : undefined}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'relative mx-auto grid h-7 w-7 place-items-center rounded-full transition-colors',
                selected
                  ? 'bg-accent font-semibold text-white'
                  : key === todayKey
                    ? 'bg-accent-soft text-accent'
                    : 'hover:bg-surface-secondary',
              )}
            >
              {index + 1}
              {hasEvents && !selected && (
                <span className="absolute bottom-0 h-1 w-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-5 border-t border-line-soft pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold">
            {selectedKey === todayKey
              ? 'Today’s agenda'
              : selectedDate.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </h3>
          <span className="text-[10px] text-muted">{dayEvents.length} events</span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {dayEvents.map((event, index) => (
            <div key={event.id} className="flex gap-3">
              <div
                className={cn(
                  'w-0.5 flex-none rounded-full',
                  index === 0 ? 'bg-accent/70' : index === 1 ? 'bg-green' : 'bg-orange/70',
                )}
              />
              <div className="min-w-0">
                <span className="text-[10px] tabular-nums text-muted">
                  {event.startTime} – {event.endTime}
                </span>
                <h4 className="mt-1 text-[12px] font-medium">{event.title}</h4>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                  <MapPin size={10} />
                  {event.room}
                </p>
              </div>
            </div>
          ))}
          {!dayEvents.length && (
            <div className="rounded-xl bg-surface-secondary px-3 py-5 text-center">
              <CalendarDays size={21} className="mx-auto text-muted" />
              <p className="mt-2 text-[11px] text-secondary">A little breathing room.</p>
              <p className="mt-1 text-[10px] text-muted">No events for this day.</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAddEvent(selectedKey)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2 text-[11px] font-medium text-secondary transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
        >
          <Plus size={13} />
          Add event
        </button>
      </div>
    </section>
  );
}
