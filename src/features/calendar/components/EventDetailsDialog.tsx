import type { ReactNode } from 'react';
import { EventReminders } from '@/features/reminders/components/ReminderControls';
import { CalendarDays, Clock, GraduationCap, MapPin, Rss, Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import {
  formatDayLabel,
  formatDuration,
  minutesOfDay,
  parseDateKey,
  relativeDayLabel,
} from '@/lib/date';
import { TONE_EVENT } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { EVENT_KINDS, EVENT_STATUS_LABEL, type CalendarEvent } from '@/features/calendar/lib/types';

interface EventDetailsDialogProps {
  event: CalendarEvent | null;
  now: Date;
  /** Name of the subscription this came from, when it did not come from here. */
  sourceName: string | null;
  onClose: () => void;
  onRemove: (id: string) => void;
}

const STATUS_STYLE = {
  confirmed: 'border-green/50 text-secondary',
  tentative: 'border-yellow/60 text-secondary',
  cancelled: 'border-coral/60 text-secondary',
} as const;

export function EventDetailsDialog({
  event,
  now,
  sourceName,
  onClose,
  onRemove,
}: EventDetailsDialogProps) {
  if (!event) return null;

  const tone = TONE_EVENT[event.tone];
  const kind = EVENT_KINDS[event.kind];
  const KindIcon = kind.icon;
  const date = parseDateKey(event.date);
  const relativeDay = relativeDayLabel(date, now);
  const duration = minutesOfDay(event.endTime) - minutesOfDay(event.startTime);

  return (
    <Modal
      open
      onClose={onClose}
      title={event.title}
      description={`${kind.label}${event.courseCode ? ` · ${event.courseCode}` : ''}`}
      footer={
        <>
          {event.sourceId ? (
            // Deleting one instance of a subscribed lecture would come back on
            // the next sync, so the source is named instead.
            <span className="mr-auto flex items-center gap-1.5 text-[11.5px] text-muted">
              <Rss size={13} strokeWidth={1.8} aria-hidden />
              From {sourceName ?? 'a subscribed calendar'}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(event.id)}
              leadingIcon={<Trash2 size={14} strokeWidth={1.8} aria-hidden />}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium text-primary',
            tone.surface,
            tone.edge,
          )}
        >
          <KindIcon size={13} strokeWidth={1.8} aria-hidden className={tone.ink} />
          {kind.label}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]',
            STATUS_STYLE[event.status],
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', tone.solid)} aria-hidden />
          {EVENT_STATUS_LABEL[event.status]}
        </span>
        <span className="text-[11.5px] text-muted">{describeTiming(event, now)}</span>
      </div>

      <dl className="mt-4 flex flex-col gap-2.5">
        <DetailRow icon={<CalendarDays size={15} strokeWidth={1.7} aria-hidden />} label="Date">
          {formatDayLabel(date)}
          {relativeDay ? <span className="text-muted"> · {relativeDay}</span> : null}
        </DetailRow>
        <DetailRow icon={<Clock size={15} strokeWidth={1.7} aria-hidden />} label="Time">
          {event.allDay ? (
            `Due at ${event.startTime}`
          ) : (
            <>
              <span className="tabular-nums">
                {event.startTime} – {event.endTime}
              </span>
              <span className="text-muted"> · {formatDuration(duration)}</span>
            </>
          )}
        </DetailRow>
        {event.room ? (
          <DetailRow icon={<MapPin size={15} strokeWidth={1.7} aria-hidden />} label="Location">
            {event.room}
          </DetailRow>
        ) : null}
        {event.instructor ? (
          <DetailRow
            icon={<GraduationCap size={15} strokeWidth={1.7} aria-hidden />}
            label="Held by"
          >
            {event.instructor}
          </DetailRow>
        ) : null}
      </dl>

      {event.note ? (
        <p className="mt-4 rounded-xl border border-line-soft bg-surface-secondary px-3.5 py-3 text-[12.5px] leading-relaxed text-secondary">
          {event.note}
        </p>
      ) : null}
      <EventReminders event={event} />
    </Modal>
  );
}

interface DetailRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function DetailRow({ icon, label, children }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-none text-muted">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="text-[13px] leading-snug text-primary">{children}</dd>
    </div>
  );
}

/** "Starts in 2h 10m", "Running now · 25m left", "Finished". */
function describeTiming(event: CalendarEvent, now: Date): string {
  const date = parseDateKey(event.date);
  const start = new Date(date);
  start.setMinutes(minutesOfDay(event.startTime));
  const end = new Date(date);
  end.setMinutes(minutesOfDay(event.endTime));

  const minutesToStart = Math.round((start.getTime() - now.getTime()) / 60_000);
  const minutesToEnd = Math.round((end.getTime() - now.getTime()) / 60_000);

  if (minutesToEnd <= 0) return 'Finished';
  if (minutesToStart <= 0) {
    return event.allDay ? 'Due today' : `Running now · ${formatDuration(minutesToEnd)} left`;
  }
  if (minutesToStart < 60 * 24) return `Starts in ${formatDuration(minutesToStart)}`;
  const days = Math.round(minutesToStart / (60 * 24));
  return `In ${days} ${days === 1 ? 'day' : 'days'}`;
}
