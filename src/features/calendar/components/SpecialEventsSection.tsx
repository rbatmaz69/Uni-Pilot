import { differenceInDays, localDateKey, parseDateKey } from '@/lib/date';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { SpecialEventCard } from './SpecialEventCard';

export function SpecialEventsSection({
  events,
  now,
  onSelect,
}: {
  events: readonly CalendarEvent[];
  now: Date;
  onSelect: (event: CalendarEvent) => void;
}) {
  const contentId = useId();
  const collapsed = useUiStore((state) => state.studentEventsCollapsed);
  const toggle = useUiStore((state) => state.toggleStudentEvents);
  const upcoming = events
    .filter(
      (event) => event.feature && event.status !== 'cancelled' && event.date >= localDateKey(now),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  if (!upcoming.length) return null;
  return (
    <section aria-label="Student events" className="shrink-0 py-3">
      <div className={cn('flex items-center justify-between gap-2 px-0.5', !collapsed && 'mb-2.5')}>
        <h3 className="min-w-0 text-[12px] font-semibold text-primary">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            className="flex items-center gap-1.5 rounded py-1 text-left transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronDown
              size={13}
              aria-hidden
              className={cn('shrink-0 motion-safe:transition-transform', collapsed && '-rotate-90')}
            />
            Beyond the classroom
          </button>
        </h3>
        <span className="text-[10px] text-muted">
          {upcoming[0] && differenceInDays(parseDateKey(upcoming[0].date), now) > 7
            ? 'Later'
            : 'Coming up'}
        </span>
      </div>
      <div
        id={contentId}
        hidden={collapsed}
        className={collapsed ? undefined : 'flex flex-col gap-3'}
      >
        {upcoming.map((event) => (
          <SpecialEventCard key={event.id} event={event} onSelect={onSelect} condensed />
        ))}
      </div>
    </section>
  );
}
