import { minutesOfDay } from '@/lib/date';

export interface TimeSpan {
  startTime: string;
  endTime: string;
}

export interface PositionedEvent<T> {
  event: T;
  startMinute: number;
  endMinute: number;
  /** 0-based slot within the overlapping cluster this event belongs to. */
  column: number;
  /** Slots the cluster needs; cards can extend behind the next slot. */
  columns: number;
}

/** Guards against reversed or zero-length input producing a negative box. */
const MIN_SPAN_MINUTES = 15;

/** The window the grid always shows, even on an empty week. */
export const DEFAULT_DAY_START = 8 * 60;
export const DEFAULT_DAY_END = 20 * 60;

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * Assigns lanes for a day's overlapping events.
 *
 * Events are swept in start order and grouped into clusters of mutually
 * overlapping entries. Inside a cluster each event takes the leftmost slot
 * whose previous occupant has already finished, which is what lets a short
 * seminar slide underneath a long lecture instead of forcing a third column.
 * The slot count is decided per cluster, so a busy Tuesday morning never
 * squeezes a quiet Tuesday afternoon.
 */
export function layoutDayEvents<T extends TimeSpan>(events: readonly T[]): PositionedEvent<T>[] {
  const sorted = events
    .map((event) => {
      const startMinute = minutesOfDay(event.startTime);
      return {
        event,
        startMinute,
        endMinute: Math.max(minutesOfDay(event.endTime), startMinute + MIN_SPAN_MINUTES),
        column: 0,
        columns: 1,
      };
    })
    // Short entries stay on the left when starts coincide; a long event then
    // sits to their right while later short entries reuse the freed lane.
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const placed: PositionedEvent<T>[] = [];
  let cluster: PositionedEvent<T>[] = [];
  let slotEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const closeCluster = () => {
    for (const item of cluster) item.columns = slotEnds.length;
    cluster = [];
    slotEnds = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const item of sorted) {
    if (item.startMinute >= clusterEnd) closeCluster();

    const free = slotEnds.findIndex((end) => end <= item.startMinute);
    if (free === -1) {
      slotEnds.push(item.endMinute);
      item.column = slotEnds.length - 1;
    } else {
      slotEnds[free] = item.endMinute;
      item.column = free;
    }

    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  closeCluster();

  return placed;
}

/**
 * A card extends under the next lane, keeping its text wider than an equal
 * split. Each later lane stays on top and exposes at least one lane's width.
 * Clamping to the day edge also keeps three-or-more collisions inside the day.
 */
export function eventColumnGeometry(column: number, columns: number) {
  const laneWidth = 100 / columns;
  const leftPercent = column * laneWidth;
  return {
    leftPercent,
    widthPercent: Math.min(laneWidth * 2, 100 - leftPercent),
  };
}

/**
 * The vertical window the grid renders: the default working day, widened to
 * whole hours whenever something starts earlier or runs later.
 */
export function gridBounds(events: readonly TimeSpan[]): {
  startMinute: number;
  endMinute: number;
} {
  let startMinute = DEFAULT_DAY_START;
  let endMinute = DEFAULT_DAY_END;

  for (const event of events) {
    const start = minutesOfDay(event.startTime);
    const end = Math.max(minutesOfDay(event.endTime), start + MIN_SPAN_MINUTES);
    startMinute = Math.min(startMinute, Math.floor(start / HOUR) * HOUR);
    endMinute = Math.max(endMinute, Math.ceil(end / HOUR) * HOUR);
  }

  return {
    startMinute: Math.max(0, startMinute),
    endMinute: Math.min(DAY, Math.max(endMinute, startMinute + HOUR)),
  };
}
