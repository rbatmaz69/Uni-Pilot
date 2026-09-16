import { describe, expect, it } from 'vitest';
import { rebuildSource, type CalendarSource } from './sourceStore';
import { buildTestFeed } from '@/features/calendar/lib/testFeed';

/**
 * Stored events are a cache, and a cache mapped by an older build used to stay
 * on screen until someone pressed Refresh. These lock in that the feed text
 * wins on every start.
 */
const cached: CalendarSource = {
  id: 'link-test',
  kind: 'link',
  name: 'Stundenplan SEB6',
  url: 'https://splan.example.edu/ical',
  lastSyncedAt: new Date().toISOString(),
  error: null,
  raw: buildTestFeed(),
  events: [
    {
      id: 'link-test:stale',
      sourceId: 'link-test',
      title: 'AKSE (262164), Ausgewählte Kapitel des Software Engineering',
      kind: 'lecture',
      tone: 'blue',
      date: '2020-01-01',
      startTime: '08:00',
      endTime: '09:00',
      status: 'confirmed',
    },
  ],
};

describe('rebuilding a source from its feed', () => {
  it('throws the stale mapping away', () => {
    const titles = rebuildSource(cached).events.map((event) => event.title);

    expect(titles).toContain('Ausgewählte Kapitel des Software Engineering');
    expect(titles.some((title) => title.includes('AKSE (262164),'))).toBe(false);
  });

  it('never leaves a title carrying its own course code twice', () => {
    for (const event of rebuildSource(cached).events) {
      expect(event.title).not.toMatch(/\(\d{4,8}\)/);
    }
  });

  it('keeps the cache when there is no feed text to re-read', () => {
    const withoutRaw = { ...cached, raw: '' };

    expect(rebuildSource(withoutRaw).events).toEqual(cached.events);
  });

  it('keeps the cache when the feed text is unusable', () => {
    const broken = { ...cached, raw: '<html>login</html>' };

    expect(rebuildSource(broken).events).toEqual(cached.events);
  });
});
