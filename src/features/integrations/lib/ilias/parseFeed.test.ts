import { describe, expect, it } from 'vitest';
import feedXml from './fixtures/privfeed.rss?raw';
import { parseNewsFeed } from './parseFeed';
import type { FeedMappingContext } from './parseFeed';

const context: FeedMappingContext = {
  origin: { provider: 'ilias', installation: 'ilias.hs-heilbronn.de' },
};

describe('parseNewsFeed', () => {
  const announcements = parseNewsFeed(feedXml, context);

  it('reads every item in the channel', () => {
    expect(announcements).toHaveLength(2);
  });

  it('reads title, body and link', () => {
    expect(announcements[0]?.title).toBe('Vorlesung am Freitag fällt aus');
    expect(announcements[0]?.body).toBe('Die Vorlesung am 24.10. entfällt krankheitsbedingt.');
    expect(announcements[0]?.url).toBe('https://ilias.hs-heilbronn.de/goto.php?target=crs_4711');
  });

  it('converts the RFC 822 date a feed carries into an ISO instant', () => {
    expect(announcements[0]?.publishedAt).toBe('2025-10-21T07:12:00.000Z');
  });

  it('uses the guid as identity, since it is the only stable one in a feed', () => {
    expect(announcements[0]?.externalId).toBe('https://ilias.hs-heilbronn.de/news.php?id=88421');
  });
});

describe('parseNewsFeed, on incomplete input', () => {
  const item = (inner: string) => `<rss version="2.0"><channel>${inner}</channel></rss>`;

  it('returns nothing for a channel with no items', () => {
    expect(parseNewsFeed(item('<title>Empty</title>'), context)).toEqual([]);
  });

  it('falls back to the link when ILIAS emitted no guid', () => {
    const feed = item('<item><title>Notice</title><link>https://example.edu/n/1</link></item>');
    expect(parseNewsFeed(feed, context)[0]?.externalId).toBe('https://example.edu/n/1');
  });

  // Two notices can share a heading, so a title is not an identity.
  it('drops an item with neither guid nor link rather than inventing an id', () => {
    expect(parseNewsFeed(item('<item><title>Notice</title></item>'), context)).toEqual([]);
  });

  it('keeps an item whose date cannot be read', () => {
    const feed = item(
      '<item><title>Notice</title><guid>g1</guid><pubDate>not a date</pubDate></item>',
    );
    const [announcement] = parseNewsFeed(feed, context);
    expect(announcement?.title).toBe('Notice');
    expect(announcement?.publishedAt).toBeNull();
  });

  it('rejects a page that is not a feed', () => {
    expect(() => parseNewsFeed('<html><body>401', context)).toThrowError(/not valid XML/);
  });
});
