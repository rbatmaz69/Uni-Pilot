import { describe, expect, it } from 'vitest';
import { parseIcs, type IcsWindow } from '@/lib/ics';
import { countBusyMinutes, mergeEvents, toCalendarEvents } from './icsMapping';
import type { CalendarEvent } from './types';

const WINDOW: IcsWindow = { from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) };

const feed = (...body: string[]) =>
  ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...body, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

const mapOne = (...body: string[]) => toCalendarEvents(parseIcs(feed(...body), WINDOW), 'src-1')[0];

describe('mapping a feed onto the grid', () => {
  it('keeps the day, the clock and the room', () => {
    const event = mapOne(
      'UID:1',
      'SUMMARY:Database Systems',
      'LOCATION:A 208',
      'DTSTART:20260908T090000',
      'DTEND:20260908T103000',
    );

    expect(event).toMatchObject({
      sourceId: 'src-1',
      title: 'Database Systems',
      date: '2026-09-08',
      startTime: '09:00',
      endTime: '10:30',
      room: 'A 208',
      status: 'confirmed',
    });
  });

  it('names the source in the id so a resync replaces rather than duplicates', () => {
    const first = mapOne('UID:stable', 'SUMMARY:X', 'DTSTART:20260908T090000');
    const second = mapOne('UID:stable', 'SUMMARY:X', 'DTSTART:20260908T090000');

    expect(first?.id).toBe(second?.id);
    expect(first?.id).toContain('src-1');
  });

  it('reads a German timetable into the right kinds', () => {
    const kindOf = (summary: string) =>
      mapOne('UID:k', `SUMMARY:${summary}`, 'DTSTART:20260908T090000', 'DTEND:20260908T100000')
        ?.kind;

    expect(kindOf('Mathematik II Vorlesung')).toBe('lecture');
    expect(kindOf('Datenbanken Praktikum')).toBe('lab');
    expect(kindOf('Analysis Übung')).toBe('seminar');
    expect(kindOf('Statistik Klausur')).toBe('exam');
    expect(kindOf('Software Engineering Tutorium')).toBe('seminar');
  });

  it('reads an English timetable too', () => {
    const kindOf = (summary: string) =>
      mapOne('UID:k', `SUMMARY:${summary}`, 'DTSTART:20260908T090000', 'DTEND:20260908T100000')
        ?.kind;

    expect(kindOf('Human-Computer Interaction Lecture')).toBe('lecture');
    expect(kindOf('Physics Lab')).toBe('lab');
    expect(kindOf('Final Exam')).toBe('exam');
  });

  it('gives exams the colour reserved for them', () => {
    expect(
      mapOne('UID:e', 'SUMMARY:Klausur Mathe', 'DTSTART:20260908T090000', 'DTEND:20260908T110000')
        ?.tone,
    ).toBe('coral');
  });

  it('gives one course the same colour every time', () => {
    const first = mapOne('UID:a', 'SUMMARY:CS-214 Database Systems', 'DTSTART:20260908T090000');
    const second = mapOne('UID:b', 'SUMMARY:CS-214 Database Systems', 'DTSTART:20260915T090000');

    expect(first?.tone).toBe(second?.tone);
  });

  it('lifts a course code out of the title', () => {
    expect(
      mapOne('UID:c', 'SUMMARY:CS-214 Database Systems', 'DTSTART:20260908T090000')?.courseCode,
    ).toBe('CS-214');
  });

  it('turns a cancelled entry into a cancelled event', () => {
    expect(
      mapOne(
        'UID:x',
        'SUMMARY:Marketing',
        'STATUS:CANCELLED',
        'DTSTART:20260908T090000',
        'DTEND:20260908T103000',
      )?.status,
    ).toBe('cancelled');
  });

  it('files an all-day entry in the pinned row', () => {
    const event = mapOne('UID:d', 'SUMMARY:Abgabe Hausarbeit', 'DTSTART;VALUE=DATE:20260909');

    expect(event).toMatchObject({ allDay: true, kind: 'deadline', date: '2026-09-09' });
  });

  it('clips an entry that runs past midnight to the end of its day', () => {
    const event = mapOne(
      'UID:night',
      'SUMMARY:Hackathon',
      'DTSTART:20260908T200000',
      'DTEND:20260909T060000',
    );

    expect(event).toMatchObject({ date: '2026-09-08', startTime: '20:00', endTime: '23:59' });
  });

  it('carries the description across as a note', () => {
    expect(
      mapOne(
        'UID:n',
        'SUMMARY:Lecture',
        'DESCRIPTION:Room changed this week',
        'DTSTART:20260908T090000',
      )?.note,
    ).toBe('Room changed this week');
  });
});

describe('a StarPlan-shaped feed', () => {
  /** Exactly the shape hs-heilbronn.de serves. */
  const hhn = (...extra: string[]) =>
    mapOne(
      'UID:1420199217849767697',
      'SUMMARY:AKSE (262164)',
      'LOCATION:A407',
      String.raw`DESCRIPTION:Ausgewählte Kapitel des Software Engineering (262164)\nProf. Dr. Thomas Fankhauser\nSEB6`,
      'DTSTART;TZID=Europe/Berlin:20260929T080000',
      'DTEND;TZID=Europe/Berlin:20260929T093000',
      ...extra,
    );

  it('prefers the full title over the abbreviation', () => {
    expect(hhn()?.title).toBe('Ausgewählte Kapitel des Software Engineering');
  });

  it('takes the module number as the course code', () => {
    expect(hhn()?.courseCode).toBe('262164');
  });

  it('lifts the lecturer out of the description', () => {
    expect(hhn()?.instructor).toBe('Prof. Dr. Thomas Fankhauser');
  });

  it('keeps the study group as a note rather than dropping it', () => {
    expect(hhn()?.note).toBe('SEB6');
  });

  it('reads the wall-clock time the campus means', () => {
    expect(hhn()).toMatchObject({ date: '2026-09-29', startTime: '08:00', endTime: '09:30' });
  });

  it('finds a kind hiding in the long title only', () => {
    const lab = mapOne(
      'UID:2',
      'SUMMARY:AQC (173593)',
      String.raw`DESCRIPTION:Angewandtes Quantencomputing Projektlabor (173593)\nProf. Dr. rer. nat. David Kreplin\nSEB6`,
      'DTSTART;TZID=Europe/Berlin:20260929T140000',
      'DTEND;TZID=Europe/Berlin:20260929T153000',
    );

    expect(lab?.kind).toBe('lab');
  });

  it('drops a placeholder room rather than printing it', () => {
    const roomOf = (location: string) =>
      mapOne(
        'UID:r',
        'SUMMARY:Vorlesung',
        `LOCATION:${location}`,
        'DTSTART:20260929T080000',
        'DTEND:20260929T093000',
      )?.room;

    expect(roomOf('--')).toBeUndefined();
    expect(roomOf('n.n.')).toBeUndefined();
    expect(roomOf('TBA')).toBeUndefined();
    expect(roomOf('A211')).toBe('A211');
    expect(roomOf(String.raw`F230\, F231`)).toBe('F230, F231');
  });

  it('leaves a feed shaped differently alone', () => {
    const other = mapOne(
      'UID:3',
      'SUMMARY:Physics Lecture',
      'DESCRIPTION:Bring a calculator',
      'DTSTART:20260929T080000',
      'DTEND:20260929T093000',
    );

    expect(other).toMatchObject({ title: 'Physics Lecture', note: 'Bring a calculator' });
    expect(other?.instructor).toBeUndefined();
  });
});

describe('merging sources', () => {
  const event = (id: string, title: string): CalendarEvent => ({
    id,
    title,
    kind: 'lecture',
    tone: 'blue',
    date: '2026-09-08',
    startTime: '09:00',
    endTime: '10:30',
    status: 'confirmed',
  });

  it('lets a later source win a collision', () => {
    const merged = mergeEvents([event('a', 'Old')], [event('a', 'New'), event('b', 'Other')]);

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.id === 'a')?.title).toBe('New');
  });

  it('adds up booked time, ignoring all-day entries', () => {
    const deadline: CalendarEvent = { ...event('c', 'Due'), allDay: true };

    expect(countBusyMinutes([event('a', 'One'), event('b', 'Two'), deadline])).toBe(180);
  });
});
