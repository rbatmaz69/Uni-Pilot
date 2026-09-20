/**
 * Talking to an ILIAS installation.
 *
 * This is the layer the rest of the app would use: point it at an address, let
 * it work out what is there, then read. Everything it knows about payload
 * shapes lives in the mappers next door; everything it knows about failure
 * lives in `errors.ts`. It holds no state and stores nothing — a session is
 * handed back to the caller, never kept here.
 *
 * Two findings from the integration research are built into this file rather
 * than left to callers to remember:
 *
 *  - The SOAP path moved in ILIAS 10, so the endpoint is discovered, not
 *    configured.
 *  - An invalid session is not refused. `getCoursesForUser` answers 200 with
 *    an empty result and `getTreeChilds` serves whatever the anonymous user
 *    may see. Checking for SOAP faults alone would show a student an empty,
 *    error-free course list after their session ended, so an empty result is
 *    never returned without re-confirming the session first.
 */

import type {
  ExternalAnnouncement,
  ExternalAssignment,
  ExternalCourse,
  ExternalItem,
  ExternalOrigin,
} from '../types';
import {
  calendarSubscriptionUrl,
  layoutForRelease,
  majorRelease,
  normaliseBaseUrl,
  privateNewsFeedUrl,
  soapEndpoint,
  type IliasLayout,
} from './endpoints';
import { buildEnvelope, buildResultSet, readEnvelope, type SoapArgument } from './envelope';
import { IliasError, fromHttpStatus } from './errors';
import { parseCourse, parseCourseList } from './parseCourses';
import { parseExercise } from './parseExercise';
import { parseNewsFeed } from './parseFeed';
import { parseTreeChildren } from './parseTree';
import { basicAuthHeader, type Transport } from './transport';

/** What the SOAP endpoint turned out to be, which decides what is possible. */
export type SoapAvailability =
  /** Answers. Whether it will accept a login is a separate question. */
  | 'available'
  /** Present, and a web server rule refuses it. Only the university can change this. */
  | 'blocked'
  /** Not at either known path. Wrong address, or an unexpected release. */
  | 'missing';

export interface IliasInstallation {
  baseUrl: string;
  /** As ILIAS reports it: `9.23`, `10.11 2026-09-03`. */
  version: string | null;
  release: number | null;
  layout: IliasLayout;
  /** Needed for the calendar and news feed URLs, not just for SOAP. */
  clientId: string | null;
  /** Every client the installation serves, when it would say. */
  clients: readonly string[];
  soap: SoapAvailability;
  /** Null unless `soap` is `available`. */
  soapEndpoint: string | null;
}

export interface IliasSession {
  readonly sid: string;
  /** Confirmed at sign-in; its presence is what makes the session trustworthy. */
  readonly userId: string;
}

export interface IliasCredentials {
  clientId: string;
  username: string;
  password: string;
}

/** Membership roles, as the bitmask `getCoursesForUser` expects. */
const COURSE_STATUS = { member: 1, tutor: 2, admin: 4, owner: 8 } as const;
/** Member, tutor and admin — a course someone tutors is still their course. */
const ALL_ENROLMENTS = COURSE_STATUS.member | COURSE_STATUS.tutor | COURSE_STATUS.admin;

export function originOf(installation: IliasInstallation): ExternalOrigin {
  return { provider: 'ilias', installation: hostOf(installation.baseUrl) };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

// --- discovery ------------------------------------------------------------

/**
 * Works out what is at an address before anybody is asked for a password.
 *
 * `getInstallationInfoXML` needs no session — it is what a client picker calls
 * before sign-in — so it can answer the release and the client id outright.
 * When SOAP is closed, the login page is read instead: it still yields the
 * release and the client id, and those are what the token channels need. An
 * installation with SOAP blocked is not a dead end, it is a smaller one.
 */
export async function discoverInstallation(
  rawBaseUrl: string,
  transport: Transport,
): Promise<IliasInstallation> {
  const baseUrl = normaliseBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    throw new IliasError('endpoint-missing', 'That is not a web address.');
  }

  let availability: SoapAvailability = 'missing';
  let endpoint: string | null = null;
  let info: { version: string | null; clients: string[] } | null = null;

  for (const layout of ['public-root', 'legacy'] as const) {
    const candidate = soapEndpoint(baseUrl, layout);
    const response = await transport({
      url: candidate,
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: buildEnvelope('getInstallationInfoXML', []),
    });

    if (response.status === 401 || response.status === 403) {
      // Keep looking: the other path may be open, and `missing` must not
      // overwrite a blocked finding if it is not.
      availability = 'blocked';
      continue;
    }
    if (response.status !== 200) continue;

    try {
      info = readInstallationInfo(readEnvelope(response.text));
    } catch {
      continue;
    }
    availability = 'available';
    endpoint = candidate;
    break;
  }

  const fallback = info ? null : await readLoginPage(baseUrl, transport);
  const version = info?.version ?? fallback?.version ?? null;
  const release = version ? majorRelease(version) : null;
  const clients = info?.clients ?? (fallback?.clientId ? [fallback.clientId] : []);

  return {
    baseUrl,
    version,
    release,
    layout: release ? layoutForRelease(release) : (fallback?.layout ?? 'public-root'),
    clientId: clients[0] ?? null,
    clients,
    soap: availability,
    soapEndpoint: endpoint,
  };
}

function readInstallationInfo(xml: string): { version: string | null; clients: string[] } {
  return {
    version: /<Installation[^>]*\sversion="([^"]+)"/.exec(xml)?.[1] ?? null,
    clients: [...xml.matchAll(/<Client[^>]*\sid="([^"]+)"/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  };
}

/**
 * Last resort when SOAP is closed. ILIAS stamps its release onto every asset
 * as a cache-buster and serves styles out of the client's own data directory,
 * so the page gives up both without being asked.
 *
 * Redirects are followed here: a signed-out installation bounces `login.php`
 * to its public repository view, and that page carries the same stamps.
 */
async function readLoginPage(
  baseUrl: string,
  transport: Transport,
): Promise<{ version: string | null; clientId: string | null; layout: IliasLayout } | null> {
  let response: HttpResponseLike;
  try {
    response = await transport({
      url: `${baseUrl}/login.php`,
      headers: { Accept: 'text/html' },
      redirect: 'follow',
    });
  } catch {
    return null;
  }
  if (response.status !== 200) return null;

  const html = response.text;
  const stamped = /[?&]version=(\d+)_(\d+)/.exec(html);

  return {
    version: stamped ? `${stamped[1]}.${stamped[2]}` : null,
    clientId:
      /[?&]client_id=([A-Za-z0-9_.-]+)/.exec(html)?.[1] ??
      /\.\/data\/([A-Za-z0-9_.-]+)\//.exec(html)?.[1] ??
      null,
    // ILIAS <= 9 serves from Services/; 10 renamed everything to components/ILIAS/.
    layout: html.includes('/Services/') ? 'legacy' : 'public-root',
  };
}

interface HttpResponseLike {
  status: number;
  text: string;
}

// --- session --------------------------------------------------------------

/**
 * Signs in and confirms the session before handing it back.
 *
 * The confirmation is not belt-and-braces. ILIAS answers several calls as the
 * anonymous user when a session is not valid, so a session that has never been
 * checked cannot be told apart from one that has expired. Doing it here means
 * every `IliasSession` in the app carries a user id that was actually proven.
 */
export async function openSession(
  installation: IliasInstallation,
  credentials: IliasCredentials,
  transport: Transport,
): Promise<IliasSession> {
  const endpoint = requireSoap(installation);

  const sid = await soapCall(
    endpoint,
    'login',
    [
      { name: 'client', value: credentials.clientId, type: 'string' },
      { name: 'username', value: credentials.username, type: 'string' },
      { name: 'password', value: credentials.password, type: 'string' },
    ],
    transport,
  );

  const trimmed = sid.trim();
  if (!trimmed || !trimmed.includes('::')) {
    throw new IliasError('credentials-rejected', 'ILIAS did not return a session.');
  }

  return { sid: trimmed, userId: await verifySession(installation, trimmed, transport) };
}

/**
 * Confirms a session is still the signed-in user's, and returns their id.
 *
 * `getUserIdBySid` is the probe because it is the one call that cannot be
 * answered anonymously — there is no anonymous id to give back.
 */
export async function verifySession(
  installation: IliasInstallation,
  sid: string,
  transport: Transport,
): Promise<string> {
  const endpoint = requireSoap(installation);

  let raw: string;
  try {
    raw = await soapCall(
      endpoint,
      'getUserIdBySid',
      [{ name: 'sid', value: sid, type: 'string' }],
      transport,
    );
  } catch (cause) {
    // With an unusable session id ILIAS fails inside PHP rather than returning
    // an authentication fault, so anything other than an id means the session
    // is no good — which is the only thing a caller can act on.
    if (cause instanceof IliasError && cause.kind === 'provider-error') {
      throw new IliasError(
        'session-expired',
        'The ILIAS session is no longer valid.',
        cause.providerMessage,
      );
    }
    throw cause;
  }

  const userId = /\d+/.exec(raw)?.[0];
  if (!userId || userId === '0') {
    throw new IliasError('session-expired', 'The ILIAS session is no longer valid.');
  }
  return userId;
}

export async function closeSession(
  installation: IliasInstallation,
  session: IliasSession,
  transport: Transport,
): Promise<void> {
  const endpoint = requireSoap(installation);
  try {
    await soapCall(
      endpoint,
      'logout',
      [{ name: 'sid', value: session.sid, type: 'string' }],
      transport,
    );
  } catch {
    // A session that cannot be closed will expire on its own. Failing here
    // would only stop someone from disconnecting.
  }
}

// --- reads ----------------------------------------------------------------

export async function fetchCourses(
  installation: IliasInstallation,
  session: IliasSession,
  transport: Transport,
): Promise<ExternalCourse[]> {
  const endpoint = requireSoap(installation);

  const xml = await soapCall(
    endpoint,
    'getCoursesForUser',
    [
      { name: 'sid', value: session.sid, type: 'string' },
      {
        name: 'parameters',
        value: buildResultSet({ user_id: session.userId, status: ALL_ENROLMENTS }),
        type: 'string',
      },
    ],
    transport,
  );

  const courses = parseCourseList(xml, {
    origin: originOf(installation),
    baseUrl: installation.baseUrl,
  });

  // An empty list is the same answer ILIAS gives for an expired session, so it
  // is not passed on until the session has been shown to still be good.
  if (courses.length === 0) {
    await verifySession(installation, session.sid, transport);
  }
  return courses;
}

export async function fetchCourse(
  installation: IliasInstallation,
  session: IliasSession,
  refId: string,
  transport: Transport,
): Promise<ExternalCourse> {
  const endpoint = requireSoap(installation);
  const xml = await soapCall(
    endpoint,
    'getCourseXML',
    [
      { name: 'sid', value: session.sid, type: 'string' },
      { name: 'course_id', value: refId, type: 'int' },
    ],
    transport,
  );

  return parseCourse(xml, refId, {
    origin: originOf(installation),
    baseUrl: installation.baseUrl,
  });
}

export async function fetchContents(
  installation: IliasInstallation,
  session: IliasSession,
  refId: string,
  transport: Transport,
): Promise<ExternalItem[]> {
  const endpoint = requireSoap(installation);
  const xml = await soapCall(
    endpoint,
    'getTreeChilds',
    [
      { name: 'sid', value: session.sid, type: 'string' },
      { name: 'ref_id', value: refId, type: 'int' },
      { name: 'types', value: '', type: 'string' },
      { name: 'user_id', value: session.userId, type: 'int' },
    ],
    transport,
  );

  const items = parseTreeChildren(xml, {
    origin: originOf(installation),
    baseUrl: installation.baseUrl,
  });

  // getTreeChilds is the call that serves anonymous content on a dead session,
  // so an empty listing gets the same treatment as an empty course list.
  if (items.length === 0) {
    await verifySession(installation, session.sid, transport);
  }
  return items;
}

export async function fetchAssignments(
  installation: IliasInstallation,
  session: IliasSession,
  refId: string,
  transport: Transport,
): Promise<ExternalAssignment[]> {
  const endpoint = requireSoap(installation);
  const xml = await soapCall(
    endpoint,
    'getExerciseXML',
    [
      { name: 'sid', value: session.sid, type: 'string' },
      { name: 'ref_id', value: refId, type: 'int' },
      // 0 keeps file contents out: they would arrive base64 inside the
      // envelope, and a listing has no use for them.
      { name: 'attachFileContentsMode', value: 0, type: 'int' },
    ],
    transport,
  );

  return parseExercise(xml, refId, {
    origin: originOf(installation),
    baseUrl: installation.baseUrl,
  });
}

// --- token channels -------------------------------------------------------

/**
 * Fetches the personal calendar feed.
 *
 * No password involved: the token is generated by the student inside ILIAS and
 * is the whole authorisation. Returns the iCal text for `src/lib/ics.ts`,
 * which already knows how to read it.
 */
export async function fetchCalendarFeed(
  installation: IliasInstallation,
  clientId: string,
  token: string,
  transport: Transport,
): Promise<string> {
  const response = await transport({
    url: calendarSubscriptionUrl(installation.baseUrl, clientId, token),
    headers: { Accept: 'text/calendar' },
  });

  if (response.status !== 200) throw fromHttpStatus(response.status);
  if (!response.text.includes('BEGIN:VCALENDAR')) {
    // ILIAS answers 200 with an empty body for a token it does not know, so
    // the status alone does not say the token worked.
    throw new IliasError(
      'credentials-rejected',
      'ILIAS returned no calendar. The subscription link may have been regenerated.',
    );
  }
  return response.text;
}

/**
 * Fetches the personal news feed.
 *
 * Authorised with HTTP Basic against the feed password a student sets in their
 * ILIAS profile — deliberately not their university password.
 */
export async function fetchAnnouncements(
  installation: IliasInstallation,
  clientId: string,
  feed: { userId: string; username: string; feedPassword: string },
  transport: Transport,
): Promise<ExternalAnnouncement[]> {
  const response = await transport({
    url: privateNewsFeedUrl(installation.baseUrl, clientId, feed.userId, feed.feedPassword),
    headers: {
      Accept: 'application/rss+xml',
      Authorization: basicAuthHeader(feed.username, feed.feedPassword),
    },
  });

  if (response.status === 401) {
    throw new IliasError(
      'credentials-rejected',
      'ILIAS did not accept that feed password. Check it in your ILIAS profile.',
    );
  }
  if (response.status !== 200) throw fromHttpStatus(response.status);

  return parseNewsFeed(response.text, { origin: originOf(installation) });
}

// --- plumbing -------------------------------------------------------------

function requireSoap(installation: IliasInstallation): string {
  if (installation.soap === 'blocked' || !installation.soapEndpoint) {
    throw new IliasError(
      installation.soap === 'blocked' ? 'endpoint-blocked' : 'endpoint-missing',
      installation.soap === 'blocked'
        ? 'This ILIAS refuses its SOAP interface from outside the university network.'
        : 'This ILIAS has no reachable SOAP interface.',
    );
  }
  return installation.soapEndpoint;
}

async function soapCall(
  endpoint: string,
  method: string,
  args: readonly SoapArgument[],
  transport: Transport,
): Promise<string> {
  const response = await transport({
    url: endpoint,
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: buildEnvelope(method, args),
  });

  // A fault arrives with status 500, so the body is read before the status is
  // judged: ILIAS's own message is more use than the number.
  if (response.status !== 200 && response.status !== 500) {
    throw fromHttpStatus(response.status);
  }
  return readEnvelope(response.text);
}
