/**
 * ILIAS RSS 2.0 -> Uni Pilot's ExternalAnnouncement.
 *
 * SOAP has no call for news, which is easy to miss: the function list is long
 * enough to look complete. Announcements come out of ILIAS the other way, as a
 * feed — either the public one per object (`feed.php`) or the personal one
 * (`privfeed.php`) covering everything the student is enrolled in.
 *
 * The private feed is worth the detour because of how it authenticates: HTTP
 * Basic against a feed password the student generates in their ILIAS profile,
 * separate from the account password. Uni Pilot can read someone's
 * announcements without ever holding a university credential.
 */

import type { ExternalAnnouncement, ExternalOrigin } from '../types';
import { parseXmlDocument, textOf } from './xml';

export interface FeedMappingContext {
  origin: ExternalOrigin;
}

export function parseNewsFeed(rss: string, context: FeedMappingContext): ExternalAnnouncement[] {
  const document = parseXmlDocument(rss);

  const announcements: ExternalAnnouncement[] = [];
  for (const item of Array.from(document.getElementsByTagName('item'))) {
    const title = textOf(item, 'title');
    const link = textOf(item, 'link');
    // `guid` is ILIAS's `about` value and the only stable identity in a feed.
    // Falling back to the link keeps an item that ILIAS emitted without one
    // from being dropped; falling back to the title would merge two notices
    // that happen to share a heading.
    const externalId = textOf(item, 'guid') ?? link;
    if (!title || !externalId) continue;

    announcements.push({
      origin: context.origin,
      externalId,
      title,
      body: textOf(item, 'description'),
      publishedAt: toIsoFromRfc822(textOf(item, 'pubDate')),
      url: link,
    });
  }
  return announcements;
}

/**
 * Feeds carry RFC 822 dates. `Date.parse` handles them, but returns NaN for
 * the malformed ones some installations emit, so the result is checked rather
 * than trusted — an announcement without a date is still worth showing.
 */
function toIsoFromRfc822(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
