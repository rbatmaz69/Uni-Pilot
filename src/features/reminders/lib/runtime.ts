import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { mergeEvents } from '@/features/calendar/lib/icsMapping';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import {
  scheduleEvents,
  type ReminderRule,
  type ReminderHistory,
  type ScheduledReminder,
} from './engine';
import { useReminderStore } from '@/features/reminders/store/reminderStore';

export function currentEvents() {
  return mergeEvents(
    ...useSourceStore.getState().sources.map((s) => s.events),
    useEventStore.getState().events,
  );
}

export function currentSchedule() {
  return scheduleEvents(currentEvents(), useReminderStore.getState().rules);
}

export function nativeReminders(): boolean {
  return isDesktopRuntime() && /Mac/.test(navigator.userAgent);
}

export async function nativeRequest(payload: Record<string, unknown>): Promise<ReminderHistory[]> {
  const history = await invoke<ReminderHistory[]>('reminder_request', { payload });
  return history.map((item) => ({ ...item, snoozeUntil: item.snoozeUntil ?? null }));
}

export async function historyAction(id: string, action: 'dismiss' | 'snooze') {
  try {
    if (nativeReminders()) {
      useReminderStore.setState({ history: await nativeRequest({ command: action, id }) });
    } else {
      useReminderStore.setState((state) => ({
        history: state.history.map((h) =>
          h.id === id
            ? {
                ...h,
                dismissed: true,
                snoozeUntil: action === 'snooze' ? Date.now() + 30 * 60_000 : null,
              }
            : h,
        ),
      }));
    }
  } catch {
    useReminderStore.setState({ error: 'Could not update this reminder. Please try again.' });
  }
}

export function saveDelivery(record: ReminderHistory) {
  useReminderStore.setState((state) => ({
    history: [
      record,
      ...state.history.filter((h) => h.id !== record.id && h.at > record.shownAt - 90 * 86_400_000),
    ],
  }));
}

export function previewPayload(event: ScheduledReminder) {
  return { command: 'preview', event };
}

export function previewEvent(event: CalendarEvent, rule: ReminderRule) {
  const [preview] = scheduleEvents([{ ...event, status: 'confirmed' }], {
    [event.id]: { ...rule, enabled: true },
  });
  if (preview) useReminderStore.setState({ preview });
}
