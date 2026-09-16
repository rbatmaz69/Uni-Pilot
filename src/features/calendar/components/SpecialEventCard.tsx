import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import { parseDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';
import { sampleImageColor } from '@/features/calendar/lib/imagePalette';
import type { CalendarEvent } from '@/features/calendar/lib/types';

interface SpecialEventCardProps {
  event: CalendarEvent;
  onSelect?: (event: CalendarEvent) => void;
  compact?: boolean;
  condensed?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** One accessible target; the pill and arrow describe the action, not nested buttons. */
export function SpecialEventCard({
  event,
  onSelect,
  compact,
  condensed,
  className,
  style,
}: SpecialEventCardProps) {
  const [palette, setPalette] = useState<{ image: string; color: string } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const feature = event.feature;
  const date = parseDateKey(event.date);
  const dateLabel = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      type={onSelect ? 'button' : undefined}
      aria-label={
        onSelect
          ? `${event.title}, ${feature?.category ?? 'Special event'}, ${dateLabel}${event.status === 'cancelled' ? ', Cancelled' : ''}`
          : undefined
      }
      onClick={onSelect ? () => onSelect(event) : undefined}
      className={cn(
        'special-event-card group/special relative isolate flex w-full flex-col rounded-xl text-left shadow-soft',
        onSelect &&
          'transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent',
        compact && 'special-event-card--compact overflow-hidden',
        condensed && 'special-event-card--condensed',
        className,
      )}
      style={{
        ...style,
        ...(palette && palette.image === feature?.image ? { '--event-color': palette.color } : {}),
      }}
    >
      <span
        className="special-event-art relative block w-full shrink-0 overflow-hidden"
        aria-hidden
      >
        {feature?.image && failedImage !== feature.image ? (
          <img
            src={feature.image}
            alt=""
            className="absolute left-0 top-0 h-full w-full object-cover object-top motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover/special:scale-[1.035]"
            style={
              feature.imageHeight
                ? {
                    height: `${(100 / feature.imageHeight) * (condensed || compact ? 1.63 : 1)}%`,
                    top: condensed || compact ? '-55%' : undefined,
                  }
                : undefined
            }
            onLoad={(loadEvent) => {
              const color = sampleImageColor(loadEvent.currentTarget, feature.imageHeight);
              if (color) setPalette({ image: feature.image, color });
            }}
            onError={() => setFailedImage(feature.image)}
          />
        ) : (
          <Sparkles className="absolute left-1/2 top-1/3 -translate-x-1/2 opacity-30" size={40} />
        )}
      </span>

      {!compact && (
        <span className="special-event-ribbon absolute z-10" aria-hidden>
          <span className="special-event-date relative flex flex-col items-center leading-none">
            <span className="text-[9px] font-bold uppercase tracking-widest">
              {date.toLocaleDateString('en', { month: 'short' })}
            </span>
            <span
              className={cn(
                'mt-1 font-semibold tracking-tight',
                condensed ? 'text-[18px]' : 'text-[23px]',
              )}
            >
              {date.getDate()}
            </span>
          </span>
        </span>
      )}

      <span className="special-event-content relative z-10 flex flex-1 flex-col px-4 pb-4">
        <span
          className={cn(
            'block font-semibold tracking-tight',
            compact
              ? 'line-clamp-2 text-[11.5px] leading-tight'
              : condensed
                ? 'text-[16px] leading-tight'
                : 'text-[20px] leading-[1.12]',
            event.status === 'cancelled' && 'line-through',
          )}
        >
          {event.title}
        </span>
        {!compact && <span className="mt-1.5 block text-[10px] opacity-80">{dateLabel}</span>}
        {!compact && (!condensed || event.room) && (
          <span className="mt-2 flex items-center gap-1 text-[11px] opacity-80">
            <MapPin size={11} aria-hidden />
            {event.room || 'Venue to be announced'}
          </span>
        )}
        <span
          className={cn(
            'flex items-center justify-between gap-2',
            compact ? 'mt-1' : condensed ? 'mt-2' : 'mt-3',
          )}
        >
          <span className="text-[10px] opacity-80">
            {event.status === 'cancelled'
              ? 'Cancelled'
              : feature?.timeUnannounced
                ? compact
                  ? 'Time TBA'
                  : 'Time to be announced'
                : event.allDay
                  ? 'All day'
                  : `${event.startTime} – ${event.endTime}`}
          </span>
          {onSelect && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold',
                !compact && 'special-event-action rounded-full px-2.5 py-1.5',
              )}
            >
              {!compact && 'Details'}
              <ArrowUpRight size={13} aria-hidden />
            </span>
          )}
        </span>
      </span>
    </Tag>
  );
}
