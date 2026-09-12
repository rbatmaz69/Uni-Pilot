import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays } from '@/lib/date';
import { parseIcs, type IcsWindow } from '@/lib/ics';
import { describeIcsHost, fetchIcsText, normaliseIcsUrl } from '@/lib/icsFetch';
import { toCalendarEvents } from '@/features/calendar/lib/icsMapping';
import type { CalendarEvent } from '@/features/calendar/lib/types';

export type CalendarSourceKind = 'link' | 'file';

export interface CalendarSource {
  id: string;
  kind: CalendarSourceKind;
  name: string;
  /** Null for an imported file: there is nothing to re-fetch. */
  url: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  /**
   * The feed exactly as it arrived. Kept so the events can be rebuilt on every
   * start instead of being frozen at subscribe time.
   */
  raw: string;
  events: CalendarEvent[];
}

/** A repeating rule needs a horizon. One past semester, one year ahead. */
const PAST_DAYS = 150;
const FUTURE_DAYS = 400;
/** A subscription older than this is refreshed when the calendar opens. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function horizon(): IcsWindow {
  const now = new Date();
  return { from: addDays(now, -PAST_DAYS), to: addDays(now, FUTURE_DAYS) };
}

function readFeed(text: string, sourceId: string, fallbackName: string) {
  const calendar = parseIcs(text, horizon());
  const events = toCalendarEvents(calendar, sourceId);
  if (!events.length) {
    throw new Error('That calendar parsed cleanly but holds no events in the next year.');
  }
  return { name: calendar.name ?? fallbackName, events };
}

/**
 * Rebuilds a source's events from the feed text it was created with.
 *
 * Stored events are a cache, not the truth. Without this, any change to how a
 * feed is read only reached calendars subscribed afterwards, and titles mapped
 * by an older build stayed on screen until someone pressed Refresh by hand.
 * It also keeps the expansion horizon moving with today rather than with the
 * day the subscription was made.
 */
export function rebuildSource(source: CalendarSource): CalendarSource {
  if (!source.raw) return source;
  try {
    const events = toCalendarEvents(parseIcs(source.raw, horizon()), source.id);
    // An empty result means the stored text is not a calendar any more, which
    // a captive portal page saved during a bad refresh will do. A cache we
    // cannot re-read beats an empty calendar.
    return events.length ? { ...source, events } : source;
  } catch {
    return source;
  }
}

interface SourceState {
  sources: CalendarSource[];
  syncingIds: string[];
  subscribe: (rawUrl: string) => Promise<CalendarSource>;
  importFile: (fileName: string, text: string) => CalendarSource;
  refresh: (id: string) => Promise<void>;
  refreshStale: () => void;
  remove: (id: string) => void;
}

export const useSourceStore = create<SourceState>()(
  persist(
    (set, get) => ({
      sources: [],
      syncingIds: [],

      subscribe: async (rawUrl) => {
        const url = normaliseIcsUrl(rawUrl);
        if (!url) throw new Error('Paste the address of a calendar feed first.');
        if (get().sources.some((source) => source.url === url)) {
          throw new Error('That calendar is already on the list.');
        }

        const id = `link-${Date.now()}`;
        const raw = await fetchIcsText(url);
        const { name, events } = readFeed(raw, id, describeIcsHost(url));
        const source: CalendarSource = {
          id,
          kind: 'link',
          name,
          url,
          lastSyncedAt: new Date().toISOString(),
          error: null,
          raw,
          events,
        };

        set((state) => ({ sources: [...state.sources, source] }));
        return source;
      },

      importFile: (fileName, text) => {
        const id = `file-${Date.now()}`;
        const { name, events } = readFeed(text, id, fileName.replace(/\.ics$/i, ''));
        const source: CalendarSource = {
          id,
          kind: 'file',
          name,
          url: null,
          lastSyncedAt: new Date().toISOString(),
          error: null,
          raw: text,
          events,
        };

        set((state) => ({ sources: [...state.sources, source] }));
        return source;
      },

      refresh: async (id) => {
        const source = get().sources.find((entry) => entry.id === id);
        if (!source?.url || get().syncingIds.includes(id)) return;

        set((state) => ({ syncingIds: [...state.syncingIds, id] }));
        try {
          const raw = await fetchIcsText(source.url);
          const { name, events } = readFeed(raw, id, source.name);
          set((state) => ({
            sources: state.sources.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    name,
                    raw,
                    events,
                    error: null,
                    lastSyncedAt: new Date().toISOString(),
                  }
                : entry,
            ),
          }));
        } catch (cause) {
          // The previous events stay on the grid: a flaky network should never
          // empty someone's timetable.
          const message = cause instanceof Error ? cause.message : 'The refresh failed.';
          set((state) => ({
            sources: state.sources.map((entry) =>
              entry.id === id ? { ...entry, error: message } : entry,
            ),
          }));
        } finally {
          set((state) => ({ syncingIds: state.syncingIds.filter((entry) => entry !== id) }));
        }
      },

      refreshStale: () => {
        const now = Date.now();
        for (const source of get().sources) {
          if (source.kind !== 'link') continue;
          // A source with no feed text was stored by a build that could not
          // rebuild its events, so its cache cannot be trusted at any age.
          if (source.raw) {
            const synced = source.lastSyncedAt ? Date.parse(source.lastSyncedAt) : 0;
            if (now - synced < STALE_AFTER_MS) continue;
          }
          void get().refresh(source.id);
        }
      },

      remove: (id) =>
        set((state) => ({ sources: state.sources.filter((source) => source.id !== id) })),
    }),
    {
      name: 'uni-pilot.calendar-sources',
      partialize: (state) => ({ sources: state.sources }),
      onRehydrateStorage: () => (state) => {
        if (state) state.sources = state.sources.map(rebuildSource);
      },
    },
  ),
);
