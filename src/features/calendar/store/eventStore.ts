import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalendarEvent } from '@/features/calendar/lib/types';

export const useEventStore = create<{
  events: CalendarEvent[];
  add: (event: CalendarEvent) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set) => ({
      events: [],
      add: (event) => set((state) => ({ events: [...state.events, event] })),
      remove: (id) => set((state) => ({ events: state.events.filter((e) => e.id !== id) })),
    }),
    { name: 'uni-pilot.calendar-events' },
  ),
);
