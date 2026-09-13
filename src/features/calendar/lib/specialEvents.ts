import type { CalendarEvent } from './types';

export const FUTURE_CITY_HACKATHON: CalendarEvent = {
  id: 'future-city-hackathon-2026',
  title: 'Future City Hackathon',
  kind: 'event',
  tone: 'green',
  date: '2026-11-13',
  startTime: '00:00',
  endTime: '23:59',
  allDay: true,
  status: 'tentative',
  note: 'Build ideas for a more connected city. A day for curious minds, creative problem solvers and student builders. Time and venue to be announced.',
  feature: {
    image: '/images/events/future-city-hackathon.png',
    category: 'Hackathon',
    imageHeight: 0.58,
    timeUnannounced: true,
  },
};
