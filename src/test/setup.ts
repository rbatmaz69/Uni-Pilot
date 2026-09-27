import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { DEFAULT_SETTINGS } from '@/features/reminders/lib/engine';
import { useUiStore } from '@/store/uiStore';

// Tests provide their own calendar fixtures, including on the first run.
beforeEach(() => useEventStore.setState({ events: [] }));

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
  useUiStore.setState({ sidebarCollapsed: false, studentEventsCollapsed: false, theme: 'light' });
  useSourceStore.setState({ sources: [], syncingIds: [] });
  useTaskStore.setState({ tasks: [] });
  useNoteStyleStore.setState({
    style: 'standard',
    layout: 'pages',
    zoom: 1,
    font: 'inter',
    textSize: 'm',
    lineSpacing: 'normal',
    paper: 'dotted',
    sound: true,
    boldColor: 'default',
    bookmarks: {},
  });
});
