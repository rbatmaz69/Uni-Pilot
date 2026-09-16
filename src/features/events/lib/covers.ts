export type Cover = 'city' | 'build' | 'design' | 'career' | 'meetup' | 'campus';

/** Shared image sources for discovery cards, calendar dates, and student-event cards. */
export const EVENT_COVERS: Record<Cover, { image: string; imageHeight?: number }> = {
  city: { image: '/images/events/future-city-hackathon.png', imageHeight: 0.58 },
  build: { image: '/images/events/build.svg' },
  design: { image: '/images/events/design.svg' },
  career: { image: '/images/events/career.svg' },
  meetup: { image: '/images/events/meetup.svg' },
  campus: { image: '/images/events/campus.svg' },
};
