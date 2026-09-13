import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { NO_HISTORY } from '@/features/integrations/lib/iliasBrowser';
import {
  resetIliasBrowserListening,
  useIliasBrowserStore,
} from '@/features/integrations/store/iliasBrowserStore';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import {
  resetCourseFilesListening,
  useCourseFilesStore,
} from '@/features/courses/store/courseFilesStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { DEFAULT_SETTINGS } from '@/features/reminders/lib/engine';
import { useUiStore } from '@/store/uiStore';
import { useFocusStore } from '@/features/focus/store/focusStore';

// Tests provide their own calendar fixtures, including on the first run.
beforeEach(() => useEventStore.setState({ events: [] }));

afterEach(() => {
  cleanup();
  useFocusStore.setState(useFocusStore.getInitialState(), true);
  localStorage.clear();
  useEventStore.setState({ events: [] });
  useReminderStore.setState({
    rules: {},
    history: [],
    preview: null,
    error: null,
    settings: DEFAULT_SETTINGS,
  });
  useUiStore.setState({
    sidebarCollapsed: false,
    studentEventsCollapsed: false,
    theme: 'light',
    immersive: false,
  });
  useSourceStore.setState({ sources: [], syncingIds: [] });
  useTaskStore.setState({ tasks: [] });
  useIliasBrowserStore.setState({ history: NO_HISTORY, downloads: [] });
  resetIliasBrowserListening();
  useCourseFilesStore.setState({
    installation: null,
    folders: null,
    syncing: {},
    reports: {},
    failures: {},
    saving: {},
  });
  resetCourseFilesListening();
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
