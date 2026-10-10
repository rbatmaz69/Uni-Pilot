import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { NO_HISTORY, NO_LOCATION } from '@/features/integrations/lib/iliasBrowser';
import {
  resetIliasBrowserListening,
  useIliasBrowserStore,
} from '@/features/integrations/store/iliasBrowserStore';
import { useDocumentsLayoutStore } from '@/features/documents/store/documentsLayoutStore';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import {
  resetCourseFilesListening,
  useCourseFilesStore,
} from '@/features/courses/store/courseFilesStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { DEFAULT_SETTINGS } from '@/features/reminders/lib/engine';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTabStore } from '@/store/tabStore';
import { useUiStore } from '@/store/uiStore';
import { useFocusStore } from '@/features/focus/store/focusStore';

// Tests provide their own calendar fixtures, including on the first run.
beforeEach(() => useEventStore.setState({ events: [] }));

/** jsdom ships no media playback at all, so autoplaying video would only log errors. */
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.load = () => {};

afterEach(() => {
  cleanup();
  useFocusStore.setState(useFocusStore.getInitialState(), true);
  useTabStore.setState(useTabStore.getInitialState(), true);
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
    studentEventsCollapsed: false,
    theme: 'light',
    panelOpen: true,
    iliasMode: false,
    panelWidths: {},
  });
  useSidebarStore.setState({
    favorites: [],
    order: {},
    hidden: [],
    documentDrag: null,
    documentDragOver: false,
    activeDocument: null,
  });
  useSourceStore.setState({ sources: [], syncingIds: [] });
  useTaskStore.setState({ tasks: [] });
  useIliasBrowserStore.setState({ history: NO_HISTORY, location: NO_LOCATION, downloads: [] });
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
  useDocumentsLayoutStore.setState({ sidebarView: 'files' });
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
