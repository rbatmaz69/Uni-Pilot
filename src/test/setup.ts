import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { DEFAULT_SETTINGS } from '@/features/reminders/lib/engine';
import { useUiStore } from '@/store/uiStore';

afterEach(() => {
  cleanup();
  localStorage.clear();
  useEventStore.setState({ events: [] });
  useReminderStore.setState({
    rules: {},
    history: [],
    preview: null,
    error: null,
    settings: DEFAULT_SETTINGS,
  });
  useUiStore.setState({ sidebarCollapsed: false, theme: 'light' });
  useSourceStore.setState({ sources: [], syncingIds: [] });
  useTaskStore.setState({ tasks: [] });
});
