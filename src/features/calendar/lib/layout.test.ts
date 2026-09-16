import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  eventColumnGeometry,
  fitBounds,
  fitHourHeight,
  gridBounds,
  layoutDayEvents,
  MAX_HOUR_HEIGHT,
} from './layout';

const span = (startTime: string, endTime: string) => ({ startTime, endTime });

describe('layoutDayEvents', () => {
  it('returns nothing for an empty day', () => {
    expect(layoutDayEvents([])).toEqual([]);
  });

  it('gives a lone event the full width', () => {
    const [placed] = layoutDayEvents([span('09:00', '10:30')]);

    expect(placed).toMatchObject({ startMinute: 540, endMinute: 630, column: 0, columns: 1 });
  });

  it('keeps back-to-back events in one column', () => {
    const placed = layoutDayEvents([span('10:00', '11:00'), span('11:00', '12:00')]);

    expect(placed.map((item) => item.columns)).toEqual([1, 1]);
    expect(placed.map((item) => item.column)).toEqual([0, 0]);
  });

  it('splits two overlapping events into neighbouring columns', () => {
    const placed = layoutDayEvents([span('09:00', '11:00'), span('10:00', '12:00')]);

    expect(placed.map((item) => item.column)).toEqual([0, 1]);
    expect(placed.every((item) => item.columns === 2)).toBe(true);
  });

  it('reuses a freed column later in the same cluster', () => {
    const placed = layoutDayEvents([
      span('09:00', '11:00'),
      span('10:00', '12:00'),
      span('11:30', '13:00'),
    ]);

    // The third event starts after the first has ended, so it slides back into
    // column 0 and the cluster still only needs two columns.
    expect(placed.map((item) => item.column)).toEqual([0, 1, 0]);
    expect(placed.every((item) => item.columns === 2)).toBe(true);
  });

  it('widens to three columns when three events truly collide', () => {
    const placed = layoutDayEvents([
      span('09:00', '12:00'),
      span('09:30', '11:00'),
      span('10:00', '10:45'),
    ]);

    expect(placed.map((item) => item.column)).toEqual([0, 1, 2]);
    expect(placed.every((item) => item.columns === 3)).toBe(true);
  });

  it('sizes each cluster on its own', () => {
    const placed = layoutDayEvents([
      span('08:00', '10:00'),
      span('09:00', '10:00'),
      span('14:00', '15:00'),
    ]);

    expect(placed.map((item) => item.columns)).toEqual([2, 2, 1]);
  });

  it('orders by start time, shortest first for matching starts', () => {
    const placed = layoutDayEvents([
      span('11:00', '12:00'),
      span('09:00', '10:00'),
      span('09:00', '13:00'),
    ]);

    expect(placed.map((item) => item.startMinute)).toEqual([540, 540, 660]);
    expect(placed[0]?.endMinute).toBe(600);
  });

  it('keeps a long event to the right of successive short entries', () => {
    const long = span('09:00', '12:00');
    const placed = layoutDayEvents([
      long,
      span('09:00', '10:00'),
      span('10:00', '10:45'),
      span('11:00', '11:30'),
    ]);

    expect(placed.find((item) => item.event === long)?.column).toBe(1);
    expect(placed.filter((item) => item.event !== long).map((item) => item.column)).toEqual([
      0, 0, 0,
    ]);
    expect(placed.every((item) => item.columns === 2)).toBe(true);
  });

  it('gives a zero-length entry a usable box', () => {
    const [placed] = layoutDayEvents([span('09:00', '09:00')]);

    expect(placed?.endMinute).toBeGreaterThan(placed?.startMinute ?? 0);
  });
});

describe('eventColumnGeometry', () => {
  it('keeps a single event at full width', () => {
    expect(eventColumnGeometry(0, 1)).toEqual({ leftPercent: 0, widthPercent: 100 });
  });

  it('lets the left card extend beneath the right card', () => {
    const back = eventColumnGeometry(0, 2);
    const front = eventColumnGeometry(1, 2);
    expect(back).toEqual({ leftPercent: 0, widthPercent: 100 });
    expect(front).toEqual({ leftPercent: 50, widthPercent: 50 });
  });

  it.each([3, 4, 8])(
    'keeps all %i overlapping cards inside their day with an exposed edge',
    (columns) => {
      const geometry = Array.from({ length: columns }, (_, column) =>
        eventColumnGeometry(column, columns),
      );
      for (let index = 0; index < geometry.length; index += 1) {
        const card = geometry[index]!;
        expect(card.leftPercent + card.widthPercent).toBeLessThanOrEqual(100);
        expect(card.widthPercent).toBeGreaterThan(0);
        const next = geometry[index + 1];
        if (next) {
          expect(next.leftPercent).toBeGreaterThan(card.leftPercent);
          expect(card.leftPercent + card.widthPercent).toBeGreaterThan(next.leftPercent);
        }
      }
    },
  );
});

describe('gridBounds', () => {
  it('shows the default working day when nothing is scheduled', () => {
    expect(gridBounds([])).toEqual({
      startMinute: DEFAULT_DAY_START,
      endMinute: DEFAULT_DAY_END,
    });
  });

  it('stays put for events inside the default window', () => {
    expect(gridBounds([span('09:00', '17:00')])).toEqual({
      startMinute: DEFAULT_DAY_START,
      endMinute: DEFAULT_DAY_END,
    });
  });

  it('opens earlier for an early start, on the hour', () => {
    expect(gridBounds([span('06:45', '08:15')]).startMinute).toBe(6 * 60);
  });

  it('runs later for a late finish, on the hour', () => {
    expect(gridBounds([span('19:00', '21:30')]).endMinute).toBe(22 * 60);
  });
});

/** The default 08:00–20:00 window, in minutes. */
const DEFAULT_SPAN = DEFAULT_DAY_END - DEFAULT_DAY_START;

describe('fitHourHeight', () => {
  it('keeps the base height until the axis has been measured', () => {
    expect(fitHourHeight(64, 0, DEFAULT_SPAN)).toBe(64);
  });

  it('leaves a laptop-sized window on the base height and lets it scroll', () => {
    expect(fitHourHeight(64, 600, DEFAULT_SPAN)).toBe(64);
  });

  it('stretches the hours to fill the height a monitor adds', () => {
    expect(fitHourHeight(64, 1188, DEFAULT_SPAN)).toBe(99);
  });

  it('never renders taller than the room it was given', () => {
    const room = 1000;
    const height = fitHourHeight(64, room, DEFAULT_SPAN);

    expect((DEFAULT_SPAN * height) / 60).toBeLessThanOrEqual(room);
  });

  it('stops growing once an hour is mostly padding', () => {
    expect(fitHourHeight(64, 9000, DEFAULT_SPAN)).toBe(MAX_HOUR_HEIGHT);
  });
});

describe('fitBounds', () => {
  const defaults = { startMinute: DEFAULT_DAY_START, endMinute: DEFAULT_DAY_END };

  it('leaves the window alone when the height is already spoken for', () => {
    expect(fitBounds(defaults, 1188)).toEqual(defaults);
  });

  it('shows an earlier hour first when height is going spare', () => {
    expect(fitBounds(defaults, 13 * MAX_HOUR_HEIGHT)).toEqual({
      startMinute: DEFAULT_DAY_START - 60,
      endMinute: DEFAULT_DAY_END,
    });
  });

  it('then widens the window at both ends', () => {
    expect(fitBounds(defaults, 14 * MAX_HOUR_HEIGHT)).toEqual({
      startMinute: DEFAULT_DAY_START - 60,
      endMinute: DEFAULT_DAY_END + 60,
    });
  });

  it('runs out at midnight rather than past it', () => {
    expect(fitBounds(defaults, 40 * MAX_HOUR_HEIGHT)).toEqual({
      startMinute: 0,
      endMinute: 24 * 60,
    });
  });
});
