import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  type ReminderHistory,
  type ReminderRule,
  type ReminderSettings,
  type ScheduledReminder,
} from '@/features/reminders/lib/engine';

export const useReminderStore = create<{
  rules: Record<string, ReminderRule>;
  settings: ReminderSettings;
  history: ReminderHistory[];
  preview: ScheduledReminder | null;
  error: string | null;
  setRule: (id: string, rule: ReminderRule) => void;
  setSettings: (settings: Partial<ReminderSettings>) => void;
}>()(
  persist(
    (set) => ({
      rules: {},
      settings: DEFAULT_SETTINGS,
      history: [],
      preview: null,
      error: null,
      setRule: (id, rule) => set((state) => ({ rules: { ...state.rules, [id]: rule } })),
      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
    }),
    {
      name: 'uni-pilot.reminders',
      partialize: ({ rules, settings, history }) => ({ rules, settings, history }),
    },
  ),
);
