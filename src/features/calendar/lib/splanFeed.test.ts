/**
 * The Heilbronn timetable, end to end.
 *
 * HHN publishes lecture timetables through StarPlan (`splan.hs-heilbronn.de`),
 * not through ILIAS, and the feed is public — no login, no token, just a URL
 * per study programme. So this is not a hypothetical source: pasting that URL
 * into the calendar already works today, and these tests are what keeps it
 * working.
 *
 * The fixture is a trimmed capture of a real WS 2026/27 feed with the
 * lecturers' names replaced. Everything else — the abbreviated SUMMARY, the
 * module number in brackets, the escaped comma between two lecturers, the
 * German course titles — is exactly what the university sends.
 */

import { describe, expect, it } from 'vitest';
import splanIcs from './fixtures/splan-hhn.ics?raw';
import { addDays } from '@/lib/date';
import { parseIcs } from '@/lib/ics';
import { toCalendarEvents } from './icsMapping';

/** Inside the WS 2026/27 lecture period the fixture was taken from. */
const DURING_TERM = new Date('2026-10-06T12:00:00Z');

function readFixture() {
  const calendar = parseIcs(splanIcs, {
    from: addDays(DURING_TERM, -150),
    to: addDays(DURING_TERM, 400),
  });
  return toCalendarEvents(calendar, 'splan');
}

describe('a StarPlan timetable feed', () => {
  const events = readFixture();

  it('keeps every occurrence', () => {
    // StarPlan writes each week out as its own VEVENT rather than using an
    // RRULE, so nothing here depends on recurrence expansion.
    expect(events).toHaveLength(18);
  });

  it('prefers the full course title over the abbreviation in SUMMARY', () => {
    // SUMMARY says "AKSE (262164)"; the first line of DESCRIPTION spells it out.
    const event = events.find((item) => item.courseCode === '262164');
    expect(event?.title).toBe('Ausgewählte Kapitel des Software Engineering');
  });

  it('reads the module number as the course code', () => {
    expect(new Set(events.map((item) => item.courseCode))).toEqual(
      new Set(['262164', '262142', '262194', '261426', '173593', '262197']),
    );
  });

  it('reads the room', () => {
    expect(events.find((item) => item.courseCode === '262164')?.room).toBe('A211');
  });

  it('reads a single lecturer', () => {
    expect(events.find((item) => item.courseCode === '262164')?.instructor).toBe(
      'Prof. Dr. Tobias Falk',
    );
  });

  it('keeps both lecturers when a course has two', () => {
    // They arrive on one line separated by an escaped comma.
    const event = events.find((item) => item.courseCode === '262142');
    expect(event?.instructor).toContain('Prof. Dr.-Ing. Markus Hahn');
    expect(event?.instructor).toContain('Ulrike Stark');
  });

  it('keeps both lecturers when they are on separate lines', () => {
    // StarPlan splits teaching staff across lines as readily as it joins them
    // with a comma. Taking only the line after the title dropped one of them
    // into the note.
    const event = events.find((item) => item.courseCode === '262197');
    expect(event?.instructor).toBe('LB Martin Berger, Prof. Dr.-Ing. Anna Vogt');
    expect(event?.note).toBe('SEB6');
  });

  it('copes with a course that names no lecturer', () => {
    // The study group sits where a name would be, and used to be shown as one.
    const event = events.find((item) => item.courseCode === '261426');
    expect(event?.title).toBe('Weiterführende Programmiersprachen');
    expect(event?.instructor ?? null).toBeNull();
    expect(event?.note).toBe('SEB6');
  });

  it('keeps the cohort and any remark the timetable carries', () => {
    expect(events.find((item) => item.courseCode === '262194')?.note).toContain('SEB6');
    expect(events.find((item) => item.courseCode === '262194')?.note).toContain('D712');
  });

  it('recognises a lab as a lab and everything else as a lecture', () => {
    const kinds = new Set(events.map((item) => item.kind));
    expect(kinds).toEqual(new Set(['lecture', 'lab']));
    expect(events.find((item) => item.courseCode === '173593')?.kind).toBe('lab');
  });

  it('converts Europe/Berlin times to the local clock', () => {
    const event = events.find((item) => item.courseCode === '262164');
    expect(event?.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(event?.endTime).toMatch(/^\d{2}:\d{2}$/);
    expect(event?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives every event a stable id derived from the feed UID', () => {
    const ids = events.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('splan:'))).toBe(true);
  });

  it('gives each course its own colour and holds none of them back', () => {
    const tones = new Map<string, Set<string>>();
    for (const event of events) {
      const code = event.courseCode ?? '';
      tones.set(code, (tones.get(code) ?? new Set()).add(event.tone));
    }
    // One tone per course, so a course does not change colour week to week.
    for (const [, used] of tones) expect(used.size).toBe(1);
  });
});
