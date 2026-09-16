import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { STUDENT_EVENTS, restoreStudentEventCovers } from '@/features/events/lib/events';
import { useDiscoveryStore } from '@/features/events/store/discoveryStore';
import { FUTURE_CITY_HACKATHON } from '@/features/calendar/lib/specialEvents';

export const useEventStore = create<{
  events: CalendarEvent[];
  add: (event: CalendarEvent) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set) => ({
      events: [FUTURE_CITY_HACKATHON],
      add: (event) => set((state) => ({ events: [...state.events, event] })),
      remove: (id) => set((state) => ({ events: state.events.filter((e) => e.id !== id) })),
    }),
    {
      name: 'uni-pilot.calendar-events',
      version: 2,
      // Preserve the original seed migration and repair already-added student
      // events without reintroducing removed events or replacing custom covers.
      migrate: (persisted, version) => {
        const previous = persisted as { events?: CalendarEvent[] };
        const events = previous.events ?? [];
        const seeded =
          version < 1 && !events.some((event) => event.id === FUTURE_CITY_HACKATHON.id)
            ? [...events, FUTURE_CITY_HACKATHON]
            : events;
        return {
          ...previous,
          events: restoreStudentEventCovers(seeded, [
            ...STUDENT_EVENTS,
            ...useDiscoveryStore.getState().createdEvents,
          ]),
        };
      },
    },
  ),
);
