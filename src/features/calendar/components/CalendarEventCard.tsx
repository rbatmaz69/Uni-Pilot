import { CircleSlash, MapPin } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatDayLabel, parseDateKey } from '@/lib/date';
import { TONE_EVENT } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { EVENT_KINDS, EVENT_STATUS_LABEL, type CalendarEvent } from '@/features/calendar/lib/types';
import { eventColumnGeometry } from '@/features/calendar/lib/layout';

interface CalendarEventCardProps {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  column: number;
  columns: number;
  gridStart: number;
  pxPerMinute: number;
  /** True while the event is running, which promotes it visually. */
  live: boolean;
  /** Day view has room for the location and who is teaching. */
  detailed: boolean;
  onSelect: (event: CalendarEvent) => void;
}

/** Below these heights the card drops a line rather than clipping it. */
const SHOW_TIME_ABOVE = 42;
const SHOW_META_ABOVE = 72;
const MIN_HEIGHT = 22;

/**
 * One entry on the time axis.
 *
 * It is a plain button, not a card with its own controls: nesting a menu
 * button inside a clickable card produces invalid markup and a confusing tab
 * order, so every action lives in the detail dialog this opens.
 */
export function CalendarEventCard({
  event,
  startMinute,
  endMinute,
  column,
  columns,
  gridStart,
  pxPerMinute,
  live,
  detailed,
  onSelect,
}: CalendarEventCardProps) {
  const tone = TONE_EVENT[event.tone];
  const kind = EVENT_KINDS[event.kind];
  const cancelled = event.status === 'cancelled';

  const height = Math.max(MIN_HEIGHT, (endMinute - startMinute) * pxPerMinute);
  const { leftPercent, widthPercent } = eventColumnGeometry(column, columns);
  const timeRange = `${event.startTime} – ${event.endTime}`;

  const label = [
    event.title,
    kind.label,
    `${formatDayLabel(parseDateKey(event.date))}, ${event.startTime} to ${event.endTime}`,
    event.room,
    event.status === 'confirmed' ? null : EVENT_STATUS_LABEL[event.status],
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => onSelect(event)}
      style={
        {
          top: (startMinute - gridStart) * pxPerMinute + 2,
          height: height - 3,
          left: `calc(${leftPercent}% + 5px)`,
          width: `calc(${widthPercent}% - 8px)`,
          '--event-layer': column + 1,
          '--event-front-layer': columns + 1,
        } as CSSProperties
      }
      className={cn(
        'group/event absolute flex flex-col overflow-hidden rounded-[4px] py-1.5 px-2.5',
        'z-[var(--event-layer)] text-left transition-shadow duration-150 hover:z-[var(--event-front-layer)] hover:shadow-soft',
        'focus-visible:z-[var(--event-front-layer)] focus-visible:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-1',
        tone.surface,
        cancelled && '[&>span]:opacity-65',
        live && 'shadow-soft',
      )}
    >
      <span
        className={cn(
          'line-clamp-2 break-words font-semibold leading-tight text-primary',
          height < SHOW_TIME_ABOVE ? 'text-[10.5px]' : detailed ? 'text-[13px]' : 'text-[12px]',
          cancelled && 'line-through decoration-1',
        )}
      >
        {event.title}
      </span>

      {height >= SHOW_TIME_ABOVE ? (
        <span className="mt-0.5 truncate text-[11px] leading-tight text-primary/70 tabular-nums">
          {timeRange}
          {event.courseCode ? (
            // Held back until the card is hovered or focused. The number is
            // reference material, not something to read a timetable by, and it
            // repeats on every card of the same course. Opacity rather than
            // display keeps the line from reflowing under the cursor.
            <span className="opacity-0 transition-opacity duration-150 group-hover/event:opacity-100 group-focus-visible/event:opacity-100">
              {' · '}
              {event.courseCode}
            </span>
          ) : null}
        </span>
      ) : null}

      {height >= SHOW_META_ABOVE ? (
        <span className="mt-auto flex items-center gap-1 pt-1 text-[10px] text-primary/70">
          {cancelled ? (
            <>
              <CircleSlash size={10} aria-hidden className="flex-none" />
              <span className="truncate">{EVENT_STATUS_LABEL.cancelled}</span>
            </>
          ) : live ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 font-medium text-inverted">
              Now
            </span>
          ) : event.room ? (
            <>
              <MapPin size={10} aria-hidden className="flex-none" />
              <span className="truncate">{event.room}</span>
            </>
          ) : null}
          {detailed && event.instructor && !cancelled ? (
            <span className="truncate border-l border-line pl-1">{event.instructor}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

interface AllDayEventChipProps {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}

/** A deadline: a moment rather than a span, pinned above the time axis. */
export function AllDayEventChip({ event, onSelect }: AllDayEventChipProps) {
  const tone = TONE_EVENT[event.tone];
  const kind = EVENT_KINDS[event.kind];
  const Icon = kind.icon;

  return (
    <button
      type="button"
      aria-label={`${event.title}, ${kind.label}, ${formatDayLabel(parseDateKey(event.date))} at ${event.startTime}`}
      onClick={() => onSelect(event)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-[4px] border px-1.5 py-1 text-left',
        'transition duration-150 hover:shadow-soft focus-visible:outline-2',
        tone.surface,
        tone.edge,
      )}
    >
      <Icon size={11} strokeWidth={2} aria-hidden className={cn('flex-none', tone.ink)} />
      <span className="truncate text-[10.5px] font-medium leading-tight text-primary">
        {event.title}
      </span>
      <span className="ml-auto hidden flex-none text-[10px] tabular-nums text-primary/70 sm:block">
        {event.startTime}
      </span>
    </button>
  );
}
