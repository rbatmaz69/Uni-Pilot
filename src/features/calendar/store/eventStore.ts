import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalendarEvent } from '@/features/calendar/lib/types';
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
      version: 1,
      // Add the requested event once for existing installations, too. Removing
      // it after this migration remains permanent across reloads.
      migrate: (persisted) => {
        const previous = persisted as { events?: CalendarEvent[] };
        const events = previous.events ?? [];
        return {
          ...previous,
          events: events.some((event) => event.id === FUTURE_CITY_HACKATHON.id)
            ? events
            : [...events, FUTURE_CITY_HACKATHON],
        };
      },
    },
  ),
);
