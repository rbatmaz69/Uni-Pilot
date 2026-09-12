import { describe, expect, it } from 'vitest';
import { parseIcs, type IcsWindow } from './ics';
import { localDateKey } from './date';

const WINDOW: IcsWindow = { from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) };

/** Wraps body lines in the VCALENDAR envelope every exporter emits. */
const calendar = (...body: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n');

const event = (...body: string[]) => calendar('BEGIN:VEVENT', ...body, 'END:VEVENT');

const times = (text: string) =>
  parseIcs(text, WINDOW).events.map(
    (entry) =>
      `${localDateKey(entry.start)} ${String(entry.start.getHours()).padStart(2, '0')}:${String(entry.start.getMinutes()).padStart(2, '0')}`,
  );

describe('parsing a single event', () => {
  it('reads the fields a timetable carries', () => {
    const [entry] = parseIcs(
      event(
        'UID:abc-123',
        'SUMMARY:Database Systems',
        'LOCATION:A 208',
        'DESCRIPTION:Bring the handout',
        'CATEGORIES:Lecture,CS-214',
        'DTSTART:20260907T091500',
        'DTEND:20260907T104500',
      ),
      WINDOW,
    ).events;

    expect(entry).toMatchObject({
      uid: 'abc-123',
      summary: 'Database Systems',
      location: 'A 208',
      description: 'Bring the handout',
      categories: ['Lecture', 'CS-214'],
      allDay: false,
    });
    expect(entry?.start.getHours()).toBe(9);
    expect(entry?.end.getMinutes()).toBe(45);
  });

  it('rejoins lines folded at 75 characters', () => {
    const [entry] = parseIcs(
      event(
        'UID:fold',
        'SUMMARY:Introduction to Human-Computer Interaction and Interface\r\n  Design',
        'DTSTART:20260907T091500',
        'DTEND:20260907T104500',
      ),
      WINDOW,
    ).events;

    expect(entry?.summary).toBe('Introduction to Human-Computer Interaction and Interface Design');
  });

  it('unescapes text without mangling a literal backslash', () => {
    const [entry] = parseIcs(
      event(
        'UID:esc',
        String.raw`SUMMARY:Maths\, part 2\; room C\\04`,
        String.raw`DESCRIPTION:First line\nSecond line`,
        'DTSTART:20260907T091500',
        'DTEND:20260907T100000',
      ),
      WINDOW,
    ).events;

    expect(entry?.summary).toBe('Maths, part 2; room C\\04');
    expect(entry?.description).toBe('First line\nSecond line');
  });

  it('converts a UTC stamp to local time', () => {
    const [entry] = parseIcs(
      event('UID:utc', 'SUMMARY:Call', 'DTSTART:20260907T080000Z', 'DTEND:20260907T090000Z'),
      WINDOW,
    ).events;

    expect(entry?.start.getTime()).toBe(Date.UTC(2026, 8, 7, 8, 0, 0));
  });

  it('reads a TZID stamp as wall-clock time', () => {
    const [entry] = parseIcs(
      event(
        'UID:tz',
        'SUMMARY:Lecture',
        'DTSTART;TZID=Europe/Berlin:20260907T081500',
        'DTEND;TZID=Europe/Berlin:20260907T094500',
      ),
      WINDOW,
    ).events;

    expect(entry?.start.getHours()).toBe(8);
    expect(entry?.start.getMinutes()).toBe(15);
  });

  it('treats a DATE value as all day', () => {
    const [entry] = parseIcs(
      event('UID:day', 'SUMMARY:Hand-in', 'DTSTART;VALUE=DATE:20260909'),
      WINDOW,
    ).events;

    expect(entry?.allDay).toBe(true);
    expect(localDateKey(entry?.start ?? new Date())).toBe('2026-09-09');
  });

  it('accepts DURATION instead of an end', () => {
    const [entry] = parseIcs(
      event('UID:dur', 'SUMMARY:Lab', 'DTSTART:20260907T140000', 'DURATION:PT1H30M'),
      WINDOW,
    ).events;

    expect(entry?.end.getHours()).toBe(15);
    expect(entry?.end.getMinutes()).toBe(30);
  });

  it('keeps the status a feed reports', () => {
    const [entry] = parseIcs(
      event(
        'UID:cancelled',
        'SUMMARY:Marketing',
        'STATUS:CANCELLED',
        'DTSTART:20260910T090000',
        'DTEND:20260910T103000',
      ),
      WINDOW,
    ).events;

    expect(entry?.status).toBe('CANCELLED');
  });

  it('names the calendar from X-WR-CALNAME', () => {
    expect(parseIcs(calendar('X-WR-CALNAME:Stundenplan WS 26/27'), WINDOW).name).toBe(
      'Stundenplan WS 26/27',
    );
  });

  it('survives junk, alarms and unknown blocks', () => {
    const parsed = parseIcs(
      calendar(
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:ok',
        'SUMMARY:Lecture',
        'DTSTART:20260907T091500',
        'DTEND:20260907T104500',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'SUMMARY:Reminder that must not become an event',
        'END:VALARM',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'SUMMARY:No start, so no event',
        'END:VEVENT',
      ),
      WINDOW,
    );

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.summary).toBe('Lecture');
  });

  it('returns nothing for input that is not a calendar', () => {
    expect(parseIcs('<html>404</html>', WINDOW).events).toEqual([]);
  });
});

describe('recurrence', () => {
  it('repeats weekly for a fixed count', () => {
    expect(
      times(
        event(
          'UID:weekly',
          'SUMMARY:Lecture',
          'DTSTART:20260907T081500',
          'DTEND:20260907T094500',
          'RRULE:FREQ=WEEKLY;COUNT=3',
        ),
      ),
    ).toEqual(['2026-09-07 08:15', '2026-09-14 08:15', '2026-09-21 08:15']);
  });

  it('stops at UNTIL', () => {
    expect(
      times(
        event(
          'UID:until',
          'SUMMARY:Lecture',
          'DTSTART:20260907T081500',
          'DTEND:20260907T094500',
          'RRULE:FREQ=WEEKLY;UNTIL=20260921T000000Z',
        ),
      ),
    ).toEqual(['2026-09-07 08:15', '2026-09-14 08:15']);
  });

  it('spreads BYDAY across the week', () => {
    expect(
      times(
        event(
          'UID:byday',
          'SUMMARY:Lecture',
          'DTSTART:20260907T100000',
          'DTEND:20260907T113000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4',
        ),
      ),
    ).toEqual(['2026-09-07 10:00', '2026-09-09 10:00', '2026-09-14 10:00', '2026-09-16 10:00']);
  });

  it('honours a fortnightly interval', () => {
    expect(
      times(
        event(
          'UID:biweekly',
          'SUMMARY:Lab',
          'DTSTART:20260907T140000',
          'DTEND:20260907T153000',
          'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3',
        ),
      ),
    ).toEqual(['2026-09-07 14:00', '2026-09-21 14:00', '2026-10-05 14:00']);
  });

  it('punches holidays out with EXDATE', () => {
    expect(
      times(
        event(
          'UID:exdate',
          'SUMMARY:Lecture',
          'DTSTART:20260907T081500',
          'DTEND:20260907T094500',
          'RRULE:FREQ=WEEKLY;COUNT=4',
          'EXDATE:20260914T081500,20260928T081500',
        ),
      ),
    ).toEqual(['2026-09-07 08:15', '2026-09-21 08:15']);
  });

  it('lets RECURRENCE-ID move a single week', () => {
    const parsed = times(
      calendar(
        'BEGIN:VEVENT',
        'UID:moved',
        'SUMMARY:Lecture',
        'DTSTART:20260907T081500',
        'DTEND:20260907T094500',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:moved',
        'RECURRENCE-ID:20260914T081500',
        'SUMMARY:Lecture, moved',
        'DTSTART:20260914T140000',
        'DTEND:20260914T153000',
        'END:VEVENT',
      ),
    );

    expect(parsed).toEqual(['2026-09-07 08:15', '2026-09-14 14:00', '2026-09-21 08:15']);
  });

  it('drops a single cancelled occurrence', () => {
    const parsed = times(
      calendar(
        'BEGIN:VEVENT',
        'UID:skip',
        'SUMMARY:Lecture',
        'DTSTART:20260907T081500',
        'DTEND:20260907T094500',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:skip',
        'RECURRENCE-ID:20260914T081500',
        'STATUS:CANCELLED',
        'SUMMARY:Lecture',
        'DTSTART:20260914T081500',
        'DTEND:20260914T094500',
        'END:VEVENT',
      ),
    );

    expect(parsed).toEqual(['2026-09-07 08:15', '2026-09-21 08:15']);
  });

  it('repeats daily and monthly too', () => {
    expect(
      times(
        event('UID:d', 'SUMMARY:Standup', 'DTSTART:20260907T090000', 'RRULE:FREQ=DAILY;COUNT=3'),
      ),
    ).toEqual(['2026-09-07 09:00', '2026-09-08 09:00', '2026-09-09 09:00']);

    expect(
      times(
        event('UID:m', 'SUMMARY:Rent', 'DTSTART:20260901T090000', 'RRULE:FREQ=MONTHLY;COUNT=3'),
      ),
    ).toEqual(['2026-09-01 09:00', '2026-10-01 09:00', '2026-11-01 09:00']);
  });

  it('clips an endless rule to the window', () => {
    const parsed = parseIcs(
      event('UID:forever', 'SUMMARY:Forever', 'DTSTART:20260907T090000', 'RRULE:FREQ=WEEKLY'),
      { from: new Date(2026, 8, 1), to: new Date(2026, 9, 1) },
    );

    expect(parsed.events).toHaveLength(4);
  });

  it('drops occurrences that fall before the window', () => {
    const parsed = parseIcs(
      event('UID:past', 'SUMMARY:Old', 'DTSTART:20260105T090000', 'RRULE:FREQ=WEEKLY;COUNT=52'),
      { from: new Date(2026, 5, 1), to: new Date(2026, 6, 1) },
    );

    expect(parsed.events.every((entry) => entry.start >= new Date(2026, 5, 1))).toBe(true);
    expect(parsed.events.length).toBeGreaterThan(0);
  });
});
