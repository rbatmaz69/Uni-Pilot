import { FUTURE_CITY_HACKATHON } from '@/features/calendar/lib/specialEvents';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { EVENT_COVERS, type Cover } from '@/features/events/lib/covers';
export type { Cover } from '@/features/events/lib/covers';
import { parseDateKey } from '@/lib/date';

export const CATEGORIES = [
  'All events',
  'Hackathons',
  'Workshops',
  'Career',
  'Meetups',
  'Campus life',
] as const;
export type Category = Exclude<(typeof CATEGORIES)[number], 'All events'>;
export interface StudentEvent {
  id: string;
  title: string;
  category: Category;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  host: string;
  description: string;
  cover: Cover;
  online?: boolean;
  sample?: boolean;
  timeUnannounced?: boolean;
}
export const STUDENT_EVENTS: StudentEvent[] = [
  {
    id: FUTURE_CITY_HACKATHON.id,
    title: FUTURE_CITY_HACKATHON.title,
    category: 'Hackathons',
    date: FUTURE_CITY_HACKATHON.date,
    startTime: FUTURE_CITY_HACKATHON.startTime,
    endTime: FUTURE_CITY_HACKATHON.endTime,
    location: 'Venue to be announced',
    host: 'Student builders',
    description: FUTURE_CITY_HACKATHON.note!,
    cover: 'city',
    timeUnannounced: true,
  },
  {
    id: 'sample-ai-build',
    title: 'Build your first AI side project',
    category: 'Workshops',
    date: '2026-11-14',
    startTime: '14:00',
    endTime: '17:00',
    location: 'Innovation Lab · Campus',
    host: 'Campus Coding Club',
    description:
      'Bring a small idea and leave with a working prototype. Explore the basics of building with AI, pair up with other students, and share what you made. Bring your laptop; beginners are welcome.',
    cover: 'build',
    sample: true,
  },
  {
    id: 'sample-design',
    title: 'Design, coffee & good ideas',
    category: 'Meetups',
    date: '2026-11-17',
    startTime: '16:00',
    endTime: '18:00',
    location: 'The Campus Café',
    host: 'Design Collective',
    description:
      'An easygoing afternoon for creative minds. Bring a project, get kind and useful feedback, or just meet students who care about design. All disciplines and experience levels welcome.',
    cover: 'design',
    sample: true,
  },
  {
    id: 'sample-career',
    title: 'Your next chapter: career night',
    category: 'Career',
    date: '2026-11-19',
    startTime: '17:30',
    endTime: '20:00',
    location: 'Main Building · Atrium',
    host: 'Student Career Network',
    description:
      'Meet graduates, hear honest stories about first jobs, and give your portfolio a little attention. An evening of short talks and relaxed conversations about life after university.',
    cover: 'career',
    sample: true,
  },
  {
    id: 'sample-open-source',
    title: 'Open source, open doors',
    category: 'Hackathons',
    date: '2026-11-21',
    startTime: '10:00',
    endTime: '18:00',
    location: 'Online',
    host: 'Open Campus',
    description:
      'Make your first open-source contribution with a friendly group of student developers. Find an issue, team up, and learn the contribution workflow together. Join from anywhere.',
    cover: 'meetup',
    online: true,
    sample: true,
  },
  {
    id: 'sample-campus',
    title: 'A little break, a few new friends',
    category: 'Campus life',
    date: '2026-11-24',
    startTime: '15:00',
    endTime: '17:00',
    location: 'Student Lounge',
    host: 'Campus Community',
    description:
      'Step away from your desk for board games, a warm drink, and a chance to meet someone outside your course. Come on your own or bring a friend.',
    cover: 'campus',
    sample: true,
  },
];
export function eventDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return parseDateKey(date).toLocaleDateString('en-GB', options);
}
export function toCalendarEvent(event: StudentEvent): CalendarEvent {
  if (event.id === FUTURE_CITY_HACKATHON.id) return FUTURE_CITY_HACKATHON;
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    kind: 'event',
    tone: 'green',
    status: 'confirmed',
    feature: { ...EVENT_COVERS[event.cover], category: event.category },
    room: event.location,
    instructor: event.host,
    note: `${event.sample ? 'Example event — not a real registration.\n\n' : ''}${event.description}`,
  };
}

/** Restore artwork omitted by older discovery-to-calendar conversions. */
export function restoreStudentEventCovers(
  events: CalendarEvent[],
  studentEvents: readonly StudentEvent[],
): CalendarEvent[] {
  const byId = new Map(studentEvents.map((event) => [event.id, event]));
  return events.map((event) => {
    const source = byId.get(event.id);
    if (event.kind !== 'event' || event.feature || event.coverImage || !source) return event;
    return { ...event, feature: toCalendarEvent(source).feature! };
  });
}
