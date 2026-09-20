/**
 * Opt-in checks against a real ILIAS installation.
 *
 * Skipped unless the environment names one, so `npm run check` stays offline
 * and deterministic. This is the only place the connector is exercised against
 * a live server rather than a stand-in transport — everything else in this
 * folder proves the code is right, and this proves the assumptions are.
 *
 *   ILIAS_LIVE_BASE_URL=https://ilias.hs-heilbronn.de npm run test:ilias
 *
 * Each channel switches itself on when its own secrets are present:
 *
 *   ILIAS_LIVE_CAL_TOKEN          iCal subscription (ILIAS: Calendar -> Subscribe)
 *   ILIAS_LIVE_FEED_USERNAME      private news feed (ILIAS: Profile -> News feed)
 *   ILIAS_LIVE_FEED_USER_ID       from the generated feed URL
 *   ILIAS_LIVE_FEED_HASH          from the generated feed URL — not the password
 *   ILIAS_LIVE_FEED_PASSWORD
 *   ILIAS_LIVE_USERNAME           SOAP read path
 *   ILIAS_LIVE_PASSWORD
 *
 * Put them in a shell you do not keep the history of, or in a gitignored
 * `.env` you source. Nothing here prints a secret: tokens, passwords and
 * session ids are never logged, and failures report ILIAS's message, not the
 * credential that produced it.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { parseIcs } from '@/lib/ics';
import { addDays } from '@/lib/date';
import {
  closeSession,
  discoverInstallation,
  fetchAnnouncements,
  fetchCalendarFeed,
  fetchContents,
  fetchCourses,
  openSession,
  type IliasInstallation,
  type IliasSession,
} from './connection';
import type { HttpRequest, Transport } from './transport';

const env = process.env;
const baseUrl = env.ILIAS_LIVE_BASE_URL ?? '';

const hasInstallation = baseUrl !== '';
const hasCalendar = hasInstallation && Boolean(env.ILIAS_LIVE_CAL_TOKEN);
const hasFeed =
  hasInstallation &&
  Boolean(
    env.ILIAS_LIVE_FEED_USERNAME && env.ILIAS_LIVE_FEED_USER_ID && env.ILIAS_LIVE_FEED_PASSWORD,
  );
const hasSoapLogin = hasInstallation && Boolean(env.ILIAS_LIVE_USERNAME && env.ILIAS_LIVE_PASSWORD);

/**
 * Node's fetch rather than the app's transport: the app's picks Tauri or the
 * browser at runtime, and neither is what a test process is.
 */
const live: Transport = async ({
  url,
  method = 'GET',
  body,
  headers = {},
  redirect = 'manual',
}: HttpRequest) => {
  const response = await fetch(url, {
    method,
    headers,
    redirect,
    signal: AbortSignal.timeout(30_000),
    ...(body === undefined ? {} : { body }),
  });

  const collected: Record<string, string> = {};
  for (const name of ['content-type', 'www-authenticate']) {
    const value = response.headers.get(name);
    if (value !== null) collected[name] = value;
  }
  return { status: response.status, text: await response.text(), headers: collected };
};

function report(line: string): void {
  console.info(`    ${line}`);
}

describe.skipIf(!hasInstallation)('a real ILIAS installation', () => {
  let installation: IliasInstallation;
  let session: IliasSession | null = null;

  afterAll(async () => {
    if (session && installation.soap === 'available') {
      await closeSession(installation, session, live);
    }
  });

  it('can be identified without signing in', async () => {
    installation = await discoverInstallation(baseUrl, live);

    report(`version   ${installation.version ?? 'unknown'}`);
    report(`client    ${installation.clients.join(', ') || 'unknown'}`);
    report(`layout    ${installation.layout}`);
    report(
      `soap      ${installation.soap}${installation.soapEndpoint ? ` (${installation.soapEndpoint})` : ''}`,
    );

    // An installation we cannot even name is one no channel will work against.
    expect(installation.baseUrl).toMatch(/^https:\/\//);
    expect(installation.version ?? installation.clientId).toBeTruthy();
  });

  // --- token channels: no university password involved --------------------

  describe.skipIf(!hasCalendar)('the iCal subscription', () => {
    it('returns a calendar for the token', async () => {
      const clientId = env.ILIAS_LIVE_CLIENT_ID ?? installation.clientId;
      expect(clientId, 'no client id — set ILIAS_LIVE_CLIENT_ID').toBeTruthy();

      const ics = await fetchCalendarFeed(installation, clientId!, env.ILIAS_LIVE_CAL_TOKEN!, live);
      expect(ics).toContain('BEGIN:VCALENDAR');

      const now = new Date();
      const calendar = parseIcs(ics, { from: addDays(now, -150), to: addDays(now, 400) });
      report(
        `calendar  "${calendar.name ?? 'unnamed'}", ${calendar.events.length} event(s) in range`,
      );

      // A calendar that parses but holds nothing usually means the token was
      // made for a single empty calendar rather than the personal one.
      expect(calendar.events.length).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!hasFeed)('the private news feed', () => {
    it('returns announcements for the feed password', async () => {
      const clientId = env.ILIAS_LIVE_CLIENT_ID ?? installation.clientId;
      expect(clientId, 'no client id — set ILIAS_LIVE_CLIENT_ID').toBeTruthy();

      const announcements = await fetchAnnouncements(
        installation,
        clientId!,
        {
          userId: env.ILIAS_LIVE_FEED_USER_ID!,
          hash: env.ILIAS_LIVE_FEED_HASH!,
          username: env.ILIAS_LIVE_FEED_USERNAME!,
          feedPassword: env.ILIAS_LIVE_FEED_PASSWORD!,
        },
        live,
      );

      report(`feed      ${announcements.length} announcement(s)`);
      if (announcements[0]) report(`latest    ${announcements[0].publishedAt ?? 'undated'}`);

      // An empty feed is a real state — a quiet week — so this only checks the
      // shape of what came back, not that there is anything in it.
      for (const announcement of announcements) {
        expect(announcement.title).toBeTruthy();
        expect(announcement.externalId).toBeTruthy();
      }
    });
  });

  // --- SOAP: needs the endpoint open and a password ILIAS accepts ----------

  describe.skipIf(!hasSoapLogin)('the SOAP read path', () => {
    it('signs in and confirms the session', async () => {
      expect(
        installation.soap,
        'SOAP is not reachable here — see docs/integrations/ilias-integration-research.md',
      ).toBe('available');

      const clientId = env.ILIAS_LIVE_CLIENT_ID ?? installation.clientId;
      session = await openSession(
        installation,
        {
          clientId: clientId!,
          username: env.ILIAS_LIVE_USERNAME!,
          password: env.ILIAS_LIVE_PASSWORD!,
        },
        live,
      );

      report(`session   confirmed for user_id ${session.userId}`);
      expect(session.userId).toMatch(/^\d+$/);
    });

    it('lists the signed-in user own courses', async () => {
      expect(session, 'sign-in did not happen').not.toBeNull();

      const courses = await fetchCourses(installation, session!, live);
      report(`courses   ${courses.length}`);
      for (const course of courses.slice(0, 5))
        report(`          ${course.externalId}  ${course.title}`);

      for (const course of courses) {
        expect(course.externalId).toMatch(/^\d+$/);
        expect(course.title).toBeTruthy();
        expect(course.origin.provider).toBe('ilias');
      }
    });

    it('reads the contents of the first course', async () => {
      expect(session, 'sign-in did not happen').not.toBeNull();

      const courses = await fetchCourses(installation, session!, live);
      if (courses.length === 0) {
        report('contents  skipped — the account is in no courses');
        return;
      }

      const items = await fetchContents(installation, session!, courses[0]!.externalId, live);
      report(`contents  ${items.length} item(s) in "${courses[0]!.title}"`);
      for (const item of items.slice(0, 5)) {
        report(
          `          ${item.providerType.padEnd(5)} ${item.title} [${item.permissions.join(',')}]`,
        );
      }

      for (const item of items) {
        expect(item.externalId).toMatch(/^\d+$/);
        expect(item.providerType).toBeTruthy();
      }
    });
  });
});

describe.skipIf(hasInstallation)('live checks', () => {
  it('are skipped without ILIAS_LIVE_BASE_URL', () => {
    expect(hasInstallation).toBe(false);
  });
});
