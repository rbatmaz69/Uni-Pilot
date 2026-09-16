import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRightPanel } from '@/features/calendar/components/CalendarRightPanel';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useDiscoveryStore } from '@/features/events/store/discoveryStore';
import { EVENT_COVERS } from '@/features/events/lib/covers';
import {
  STUDENT_EVENTS,
  restoreStudentEventCovers,
  toCalendarEvent,
  type StudentEvent,
} from '@/features/events/lib/events';

beforeEach(() => useDiscoveryStore.setState({ savedIds: [], createdEvents: [] }));
afterEach(() => useDiscoveryStore.setState({ savedIds: [], createdEvents: [] }));

const workshop = STUDENT_EVENTS[1]!;
const custom: StudentEvent = {
  ...workshop,
  id: 'my-design-meetup',
  title: 'My design meetup',
  cover: 'design',
  category: 'Meetups',
  date: '2026-11-17',
};

describe('student-event artwork in the calendar', () => {
  it.each([workshop, custom])('shows $title on its date and in Beyond the classroom', (source) => {
    const event = toCalendarEvent(source);
    render(
      <CalendarRightPanel
        focusDay={new Date(2026, 10, 1)}
        now={new Date(2026, 8, 15)}
        events={[event]}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );
    const cell = screen.getByRole('button', { name: new RegExp(`2026, ${source.title}`) });
    expect(cell.querySelector('img')).toHaveAttribute('src', EVENT_COVERS[source.cover].image);
    const cards = within(screen.getByRole('region', { name: 'Student events' }));
    const card = cards.getByRole('button', { name: new RegExp(source.title) });
    expect(card.querySelector('img')).toHaveAttribute('src', EVENT_COVERS[source.cover].image);
    expect(card).toHaveTextContent(source.title);
  });

  it('repairs previously added sample and custom events without adding removed events back', async () => {
    useDiscoveryStore.setState({ createdEvents: [custom] });
    const legacy = [workshop, custom].map((event) => {
      const converted = toCalendarEvent(event);
      delete converted.feature;
      return { ...converted, note: 'My edited note' };
    });
    localStorage.setItem(
      'uni-pilot.calendar-events',
      JSON.stringify({ version: 1, state: { events: legacy } }),
    );
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events).toHaveLength(2);
    expect(useEventStore.getState().events[0]).toMatchObject({
      id: workshop.id,
      note: 'My edited note',
      feature: { image: EVENT_COVERS.build.image },
    });
    expect(useEventStore.getState().events[1]).toMatchObject({
      id: custom.id,
      note: 'My edited note',
      feature: { image: EVENT_COVERS.design.image },
    });
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events).toHaveLength(2);
    useEventStore.getState().remove(workshop.id);
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events.map((event) => event.id)).toEqual([custom.id]);
  });

  it('preserves custom covers, unrelated events, and existing feature data', () => {
    const event = toCalendarEvent(workshop);
    const replaced = { ...event, coverImage: '/my-cover.png' };
    delete replaced.feature;
    const unrelated = { ...event, id: 'unrelated-event' };
    delete unrelated.feature;
    expect(restoreStudentEventCovers([event, replaced, unrelated], STUDENT_EVENTS)).toEqual([
      event,
      replaced,
      unrelated,
    ]);
  });
});
