import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudentEvent } from '@/features/events/lib/events';

export const useDiscoveryStore = create<{
  savedIds: string[];
  createdEvents: StudentEvent[];
  toggleSaved: (id: string) => void;
  createEvent: (event: StudentEvent) => void;
}>()(
  persist(
    (set) => ({
      savedIds: [],
      createdEvents: [],
      toggleSaved: (id) =>
        set((state) => ({
          savedIds: state.savedIds.includes(id)
            ? state.savedIds.filter((saved) => saved !== id)
            : [...state.savedIds, id],
        })),
      createEvent: (event) => set((state) => ({ createdEvents: [...state.createdEvents, event] })),
    }),
    { name: 'uni-pilot.student-events', version: 1 },
  ),
);
