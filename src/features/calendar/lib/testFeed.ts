import { addDays, localDateKey, startOfWeek } from '@/lib/date';
import { parseIcs } from '@/lib/ics';
import { toCalendarEvents } from './icsMapping';
import { useSourceStore, type CalendarSource } from '@/features/calendar/store/sourceStore';

/**
 * A timetable shaped exactly like the one hs-heilbronn.de serves, anchored on
 * the week the tests run in. Used instead of fixed dates so a suite run in any
 * month still exercises "this week".
 */
const monday = () => startOfWeek(new Date());
const at = (dayOffset: number, time: string) =>
  `${localDateKey(addDays(monday(), dayOffset)).replace(/-/g, '')}T${time}`;

interface Entry {
  uid: string;
  summary: string;
  description: string;
  location: string;
  day: number;
  start: string;
  end: string;
  extra?: string[];
}

const ENTRIES: Entry[] = [
  {
    uid: 'akse-1',
    summary: 'AKSE (262164)',
    description:
      'Ausgewählte Kapitel des Software Engineering (262164)\\nProf. Dr. Thomas Fankhauser\\nSEB6',
    location: 'A407',
    day: 0,
    start: '081500',
    end: '094500',
  },
  {
    uid: 'ds-1',
    summary: 'Data Science (262124)',
    description: 'Data Science im Unternehmenskontext (262124)\\nProf. Dr. Christine Reck\\nSEB6',
    location: 'C12',
    day: 1,
    start: '090000',
    end: '103000',
  },
  {
    uid: 'aqc-lab',
    summary: 'AQC (173593)',
    description:
      'Angewandtes Quantencomputing Projektlabor (173593)\\nProf. Dr. rer. nat. David Kreplin\\nSEB6',
    location: 'Labor 2',
    day: 2,
    start: '140000',
    end: '153000',
  },
  {
    uid: 'recht-1',
    summary: 'Recht IT (262074)',
    description: 'Recht der Informationstechnologie (262074)\\nProf. Dr. Vogel\\nSEB6',
    location: 'B104',
    day: 3,
    start: '100000',
    end: '113000',
    extra: ['STATUS:CANCELLED'],
  },
  {
    uid: 'klausur-1',
    summary: 'Klausur ML & ME (262198)',
    description: 'Klausur Machine Learning (262198)\\nProf. Dr. Keller\\nSEB6',
    location: 'Aula',
    day: 3,
    start: '140000',
    end: '160000',
  },
  {
    uid: 'embsys-1',
    summary: 'EmbSyst (262142)',
    description: 'Embedded Systems (262142)\\nProf. Dr. Neumann\\nSEB6',
    location: 'A105',
    day: 4,
    start: '081500',
    end: '094500',
  },
];

export function buildTestFeed(): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Progotec//StarPlan ics//DE',
    'VERSION:2.0',
    'X-WR-CALNAME:Stundenplan SEB6',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'END:VTIMEZONE',
  ];

  for (const entry of ENTRIES) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.uid}`,
      `SUMMARY:${entry.summary}`,
      `DESCRIPTION:${entry.description}`,
      `LOCATION:${entry.location}`,
      `DTSTART;TZID=Europe/Berlin:${at(entry.day, entry.start)}`,
      `DTEND;TZID=Europe/Berlin:${at(entry.day, entry.end)}`,
      ...(entry.extra ?? []),
      'END:VEVENT',
    );
  }

  // A hand-in next week, which lands in the pinned row rather than the axis.
  lines.push(
    'BEGIN:VEVENT',
    'UID:abgabe-1',
    'SUMMARY:Abgabe Projektbericht (262199)',
    `DTSTART;VALUE=DATE:${localDateKey(addDays(monday(), 9)).replace(/-/g, '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return lines.join('\r\n');
}

/** Seeds the store as though the feed had been subscribed to already. */
export function seedTestSource(id = 'link-test'): CalendarSource {
  const window = { from: addDays(new Date(), -60), to: addDays(new Date(), 120) };
  const raw = buildTestFeed();
  const source: CalendarSource = {
    id,
    kind: 'link',
    name: 'Stundenplan SEB6',
    url: 'https://splan.example.edu/ical',
    lastSyncedAt: new Date().toISOString(),
    error: null,
    raw,
    events: toCalendarEvents(parseIcs(raw, window), id),
  };

  useSourceStore.setState({ sources: [source] });
  return source;
}
