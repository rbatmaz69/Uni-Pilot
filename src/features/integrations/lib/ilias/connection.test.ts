import { describe, expect, it, vi } from 'vitest';
import liveCourseListXml from './fixtures/courses-for-user.xml?raw';
import liveTreeXml from './fixtures/tree-childs.xml?raw';
import feedRss from './fixtures/privfeed.rss?raw';
import {
  closeSession,
  discoverInstallation,
  fetchAnnouncements,
  fetchAssignments,
  fetchCalendarFeed,
  fetchContents,
  fetchCourses,
  openSession,
  originOf,
  verifySession,
  type IliasInstallation,
  type IliasSession,
} from './connection';
import { IliasError } from './errors';
import type { HttpRequest, HttpResponse, Transport } from './transport';

// --- a stand-in for the network -------------------------------------------

/** Wraps a payload the way ILIAS does: escaped, inside a string member. */
function soapBody(payload: string, member = 'xml'): string {
  const escaped = payload.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return (
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:ilUserAdministration">' +
    `<SOAP-ENV:Body><ns1:response><${member} xsi:type="xsd:string">${escaped}</${member}></ns1:response></SOAP-ENV:Body>` +
    '</SOAP-ENV:Envelope>'
  );
}

function soapFault(message: string): string {
  return (
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>' +
    `<SOAP-ENV:Fault><faultcode>Server</faultcode><faultstring>${message}</faultstring></SOAP-ENV:Fault>` +
    '</SOAP-ENV:Body></SOAP-ENV:Envelope>'
  );
}

const INSTALLATION_INFO =
  '<Installation version="10.11 2026-09-03" path="https://demo.ilias.de">' +
  '<Clients><Client id="demo" enabled="TRUE"/></Clients></Installation>';

type Handler = (request: HttpRequest, method: string | null) => HttpResponse | null;

/** Builds a transport from handlers tried in order, with a 404 as the floor. */
function transportOf(...handlers: readonly Handler[]): Transport & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = (request: HttpRequest): Promise<HttpResponse> => {
    calls.push(request);
    const method = /<soapenv:Body><(\w+)/.exec(request.body ?? '')?.[1] ?? null;
    for (const handler of handlers) {
      const response = handler(request, method);
      if (response) return Promise.resolve(response);
    }
    return Promise.resolve({ status: 404, text: 'not found', headers: {} });
  };
  return Object.assign(transport, { calls });
}

const ok = (text: string): HttpResponse => ({ status: 200, text, headers: {} });
const status = (code: number, text = ''): HttpResponse => ({ status: code, text, headers: {} });

/** Answers getInstallationInfoXML at whichever path the test says is live. */
const servesSoapAt =
  (path: string): Handler =>
  (request, method) =>
    request.url.endsWith(path) && method === 'getInstallationInfoXML'
      ? ok(soapBody(INSTALLATION_INFO))
      : null;

const installed: IliasInstallation = {
  baseUrl: 'https://demo.ilias.de',
  version: '10.11 2026-09-03',
  release: 10,
  layout: 'public-root',
  clientId: 'demo',
  clients: ['demo'],
  signIn: 'password',
  soap: 'available',
  soapEndpoint: 'https://demo.ilias.de/soap/server.php',
};

const session: IliasSession = { sid: 'abc123::demo', userId: '13' };

// --- discovery ------------------------------------------------------------

describe('discoverInstallation', () => {
  it('finds the endpoint a release 10 installation serves', async () => {
    const transport = transportOf(servesSoapAt('/soap/server.php'));
    const found = await discoverInstallation('https://demo.ilias.de', transport);

    expect(found.soap).toBe('available');
    expect(found.soapEndpoint).toBe('https://demo.ilias.de/soap/server.php');
    expect(found.release).toBe(10);
    expect(found.layout).toBe('public-root');
    expect(found.clientId).toBe('demo');
  });

  it('finds the older endpoint when the newer one is not there', async () => {
    const transport = transportOf(servesSoapAt('/webservice/soap/server.php'));
    const found = await discoverInstallation('https://old.example.edu', transport);

    expect(found.soapEndpoint).toBe('https://old.example.edu/webservice/soap/server.php');
  });

  it('accepts a pasted deep link instead of the bare address', async () => {
    const transport = transportOf(servesSoapAt('/soap/server.php'));
    const found = await discoverInstallation(
      'https://demo.ilias.de/ilias.php?baseClass=ilrepositorygui&ref_id=1',
      transport,
    );

    expect(found.baseUrl).toBe('https://demo.ilias.de');
  });

  /**
   * The Heilbronn case: SOAP answers 403, and the login page still has to give
   * up the release and the client id, because the token channels need them.
   */
  it('reports a blocked endpoint and still reads the installation from the login page', async () => {
    const loginPage =
      '<html><link href="./Services/Accordion/css/accordion.css?version=9_23">' +
      '<img src="./data/iliashhn/css/logo.png"></html>';
    const transport = transportOf(
      (request) => (request.url.includes('/soap/') ? status(403, 'Forbidden') : null),
      (request) => (request.url.endsWith('/login.php') ? ok(loginPage) : null),
    );

    const found = await discoverInstallation('https://ilias.hs-heilbronn.de', transport);

    expect(found.soap).toBe('blocked');
    expect(found.soapEndpoint).toBeNull();
    expect(found.version).toBe('9.23');
    expect(found.release).toBe(9);
    expect(found.layout).toBe('legacy');
    expect(found.clientId).toBe('iliashhn');
  });

  it('reports a missing endpoint when nothing answers anywhere', async () => {
    const found = await discoverInstallation('https://not-ilias.example', transportOf());
    expect(found.soap).toBe('missing');
    expect(found.clientId).toBeNull();
  });

  it('refuses something that is not an address rather than probing it', async () => {
    await expect(discoverInstallation('   ', transportOf())).rejects.toThrowError(IliasError);
  });

  // Markup taken from the two real login forms, 23.09.2026. ILIAS 9+ generates
  // field names, so only the input type says "password".
  const PASSWORD_FIELD =
    '<input type="text" name="login_form/input_3/input_4" />' +
    '<input type="password" name="login_form/input_3/input_5" autocomplete="off" />';
  const SSO_LINK = '<a href="https://ilias.hs-heilbronn.de/openidconnect.php">Anmelden</a>';

  const loginPageWith =
    (html: string): Handler =>
    (request) =>
      request.url.includes('/login.php?') ? ok(`<html><body>${html}</body></html>`) : null;

  it('reads Heilbronn as offering both, which is what its login page does', async () => {
    const found = await discoverInstallation(
      'https://ilias.hs-heilbronn.de',
      transportOf(loginPageWith(PASSWORD_FIELD + SSO_LINK)),
    );
    expect(found.signIn).toBe('both');
  });

  it('reads an installation with only a password form as password', async () => {
    const found = await discoverInstallation(
      'https://demo.ilias.de',
      transportOf(loginPageWith(PASSWORD_FIELD)),
    );
    expect(found.signIn).toBe('password');
  });

  it('reads an installation with only a sign-on link as sso', async () => {
    const found = await discoverInstallation(
      'https://sso-only.example.edu',
      transportOf(loginPageWith(SSO_LINK)),
    );
    expect(found.signIn).toBe('sso');
  });

  /**
   * The first version of this check matched `name="password"`, which ILIAS 9
   * never renders — every installation looked SSO-only, Heilbronn included.
   */
  it('does not rely on the field being named password', () => {
    expect(PASSWORD_FIELD).not.toContain('name="password"');
  });

  it('asks for the real login form, not the page login.php redirects to', async () => {
    const transport = transportOf(servesSoapAt('/soap/server.php'), loginPageWith(PASSWORD_FIELD));
    await discoverInstallation('https://demo.ilias.de', transport);

    const signInRequest = transport.calls.find((call) => call.url.includes('/login.php?'));
    expect(signInRequest?.url).toBe(
      'https://demo.ilias.de/login.php?cmd=force_login&client_id=demo',
    );
    expect(signInRequest?.redirect).toBe('follow');
  });

  it('reports unknown when the login page cannot be read', async () => {
    const found = await discoverInstallation('https://demo.ilias.de', transportOf());
    expect(found.signIn).toBe('unknown');
  });

  it('derives the origin from the host, so two universities never collide', () => {
    expect(originOf(installed)).toEqual({ provider: 'ilias', installation: 'demo.ilias.de' });
  });
});

// --- session --------------------------------------------------------------

describe('openSession', () => {
  const signsIn: Handler = (_request, method) =>
    method === 'login' ? ok(soapBody('sid-from-ilias::demo')) : null;
  const confirmsUser: Handler = (_request, method) =>
    method === 'getUserIdBySid' ? ok(soapBody('13')) : null;

  it('returns a session whose user id has actually been confirmed', async () => {
    const transport = transportOf(signsIn, confirmsUser);
    const opened = await openSession(
      installed,
      { clientId: 'demo', username: 'someone', password: 'secret' },
      transport,
    );

    expect(opened).toEqual({ sid: 'sid-from-ilias::demo', userId: '13' });
    // Signing in is not enough on its own — the session is probed as well.
    expect(transport.calls).toHaveLength(2);
  });

  it('reports a rejected password as such, using the key ILIAS sends', async () => {
    const transport = transportOf(() => status(500, soapFault('err_wrong_login')));

    await expect(
      openSession(installed, { clientId: 'demo', username: 'a', password: 'b' }, transport),
    ).rejects.toMatchObject({ kind: 'credentials-rejected' });
  });

  it('refuses an answer that is not a session id', async () => {
    const transport = transportOf((_request, method) =>
      method === 'login' ? ok(soapBody('')) : null,
    );

    await expect(
      openSession(installed, { clientId: 'demo', username: 'a', password: 'b' }, transport),
    ).rejects.toMatchObject({ kind: 'credentials-rejected' });
  });

  it('will not try to sign in where SOAP is blocked', async () => {
    const blocked: IliasInstallation = { ...installed, soap: 'blocked', soapEndpoint: null };
    const transport = transportOf();

    await expect(
      openSession(blocked, { clientId: 'demo', username: 'a', password: 'b' }, transport),
    ).rejects.toMatchObject({ kind: 'endpoint-blocked' });
    expect(transport.calls).toHaveLength(0);
  });
});

describe('verifySession', () => {
  it('returns the user id for a live session', async () => {
    const transport = transportOf(() => ok(soapBody('13')));
    await expect(verifySession(installed, 'abc::demo', transport)).resolves.toBe('13');
  });

  /**
   * ILIAS fails inside PHP rather than raising an authentication fault when the
   * session id was never issued, so the generic provider error has to be read
   * as an expired session — that is the only thing a caller can act on.
   */
  it('reads the PHP error ILIAS raises for a dead session as an expired session', async () => {
    const transport = transportOf(() =>
      status(500, soapFault('Trying to access array offset on value of type null')),
    );

    await expect(verifySession(installed, 'stale::demo', transport)).rejects.toMatchObject({
      kind: 'session-expired',
    });
  });

  it('treats a zero user id as no session', async () => {
    const transport = transportOf(() => ok(soapBody('0')));
    await expect(verifySession(installed, 'x::demo', transport)).rejects.toMatchObject({
      kind: 'session-expired',
    });
  });
});

describe('closeSession', () => {
  it('does not fail when ILIAS will not close the session', async () => {
    const transport = transportOf(() => status(500, soapFault('Session invalid')));
    await expect(closeSession(installed, session, transport)).resolves.toBeUndefined();
  });
});

// --- reads ----------------------------------------------------------------

describe('fetchCourses', () => {
  it('maps the result set ILIAS answers with', async () => {
    const transport = transportOf((_request, method) =>
      method === 'getCoursesForUser' ? ok(soapBody(liveCourseListXml)) : null,
    );

    const courses = await fetchCourses(installed, session, transport);

    expect(courses).toHaveLength(1);
    expect(courses[0]?.title).toBe('Ordner');
    expect(courses[0]?.externalId).toBe('717');
    expect(courses[0]?.origin.installation).toBe('demo.ilias.de');
  });

  it('asks for memberships, tutorships and administrations together', async () => {
    const transport = transportOf((_request, method) =>
      method === 'getCoursesForUser' ? ok(soapBody(liveCourseListXml)) : null,
    );
    await fetchCourses(installed, session, transport);

    // 1 | 2 | 4 — a course someone tutors is still their course.
    expect(transport.calls[0]?.body).toContain('&lt;column&gt;7&lt;/column&gt;');
    expect(transport.calls[0]?.body).toContain('&lt;column&gt;13&lt;/column&gt;');
  });

  /**
   * The finding this whole guard exists for: ILIAS answers an expired session
   * with 200 and an empty result, so without re-checking, a student would be
   * shown an empty, error-free course list.
   */
  it('does not report an empty list until the session has been re-confirmed', async () => {
    const emptyResult =
      '<result><colspecs><colspec idx="0" name="ref_id"/><colspec idx="1" name="xml"/>' +
      '</colspecs><rows></rows></result>';
    const transport = transportOf(
      (_request, method) => (method === 'getCoursesForUser' ? ok(soapBody(emptyResult)) : null),
      (_request, method) =>
        method === 'getUserIdBySid'
          ? status(500, soapFault('Trying to access array offset on value of type null'))
          : null,
    );

    await expect(fetchCourses(installed, session, transport)).rejects.toMatchObject({
      kind: 'session-expired',
    });
  });

  it('reports an empty list once the session has been confirmed as good', async () => {
    const emptyResult =
      '<result><colspecs><colspec idx="0" name="ref_id"/><colspec idx="1" name="xml"/>' +
      '</colspecs><rows></rows></result>';
    const transport = transportOf(
      (_request, method) => (method === 'getCoursesForUser' ? ok(soapBody(emptyResult)) : null),
      (_request, method) => (method === 'getUserIdBySid' ? ok(soapBody('13')) : null),
    );

    await expect(fetchCourses(installed, session, transport)).resolves.toEqual([]);
  });
});

describe('fetchContents', () => {
  it('maps the repository listing', async () => {
    const transport = transportOf((_request, method) =>
      method === 'getTreeChilds' ? ok(soapBody(liveTreeXml, 'object_xml')) : null,
    );

    const items = await fetchContents(installed, session, '279', transport);

    expect(items).toHaveLength(23);
    expect(items.find((item) => item.kind === 'course')?.externalId).toBe('717');
  });

  it('re-confirms the session before reporting an empty folder', async () => {
    const transport = transportOf(
      (_request, method) =>
        method === 'getTreeChilds' ? ok(soapBody('<Objects/>', 'object_xml')) : null,
      (_request, method) => (method === 'getUserIdBySid' ? ok(soapBody('13')) : null),
    );

    await expect(fetchContents(installed, session, '279', transport)).resolves.toEqual([]);
    expect(
      transport.calls.map((call) => /<soapenv:Body><(\w+)/.exec(call.body ?? '')?.[1]),
    ).toEqual(['getTreeChilds', 'getUserIdBySid']);
  });

  it('passes a permission refusal through untouched', async () => {
    const transport = transportOf(() =>
      status(500, soapFault('No permission to edit the object with id: 279')),
    );

    await expect(fetchContents(installed, session, '279', transport)).rejects.toMatchObject({
      kind: 'permission-denied',
    });
  });
});

describe('fetchAssignments', () => {
  it('asks for metadata only, not for file contents', async () => {
    const exercise =
      '<Exercise obj_id="il_1_exc_9"><Title>Abgaben</Title>' +
      '<Assignment><Instruction>Blatt 1</Instruction><DueDate>1730073600</DueDate></Assignment></Exercise>';
    const transport = transportOf(() => ok(soapBody(exercise)));

    const assignments = await fetchAssignments(installed, session, '4711', transport);

    expect(assignments[0]?.dueAt).toBe('2024-10-28T00:00:00.000Z');
    // Contents would arrive base64 inside the envelope; a listing has no use for them.
    expect(transport.calls[0]?.body).toContain(
      '<attachFileContentsMode xsi:type="xsd:int">0</attachFileContentsMode>',
    );
  });
});

// --- token channels -------------------------------------------------------

describe('fetchCalendarFeed', () => {
  it('returns the iCal text for the existing parser to read', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
    const transport = transportOf(() => ok(ics));

    await expect(fetchCalendarFeed(installed, 'iliashhn', 'tok', transport)).resolves.toContain(
      'BEGIN:VCALENDAR',
    );
    expect(transport.calls[0]?.url).toBe(
      'https://demo.ilias.de/calendar.php?client_id=iliashhn&token=tok',
    );
  });

  /**
   * ILIAS answers an unknown token with 200 and an empty body, so the status
   * on its own would look like success.
   */
  it('treats an empty answer as a token ILIAS no longer knows', async () => {
    const transport = transportOf(() => ok(''));

    await expect(
      fetchCalendarFeed(installed, 'iliashhn', 'stale', transport),
    ).rejects.toMatchObject({ kind: 'credentials-rejected' });
  });

  it('reports a blocked calendar endpoint as one only the university can fix', async () => {
    const transport = transportOf(() => status(403));
    await expect(fetchCalendarFeed(installed, 'c', 't', transport)).rejects.toMatchObject({
      kind: 'endpoint-blocked',
    });
  });
});

describe('fetchAnnouncements', () => {
  const feed = {
    userId: '4711',
    hash: 'feed-hash-from-the-url',
    username: 'student',
    feedPassword: 'feed-secret',
  };

  it('reads the feed and maps its items', async () => {
    const transport = transportOf(() => ok(feedRss));

    const announcements = await fetchAnnouncements(installed, 'iliashhn', feed, transport);

    expect(announcements).toHaveLength(2);
    expect(announcements[0]?.title).toBe('Vorlesung am Freitag fällt aus');
  });

  /**
   * ILIAS checks the password in privfeed.php and then compares the hash inside
   * ilUserFeedWriter. They are different secrets, and sending the password as
   * the hash authenticates fine before yielding an empty feed.
   */
  it('sends the hash in the URL and the feed password over Basic', async () => {
    const transport = transportOf(() => ok(feedRss));
    await fetchAnnouncements(installed, 'iliashhn', feed, transport);

    expect(transport.calls[0]?.url).toBe(
      'https://demo.ilias.de/privfeed.php?client_id=iliashhn&user_id=4711&hash=feed-hash-from-the-url',
    );
    expect(transport.calls[0]?.headers?.Authorization).toBe(`Basic ${btoa('student:feed-secret')}`);
  });

  it('tells a feed ILIAS never filled in apart from a quiet week', async () => {
    // No items and no channel title: the writer bailed out, which is what a
    // wrong hash or private feeds being switched off looks like.
    const unfilled = '<rss version="2.0"><channel><title></title></channel></rss>';
    const transport = transportOf(() => ok(unfilled));

    await expect(fetchAnnouncements(installed, 'iliashhn', feed, transport)).rejects.toThrowError(
      /feed hash/,
    );
  });

  it('accepts a titled feed with nothing in it as a quiet week', async () => {
    const quiet = '<rss version="2.0"><channel><title>ILIAS HHN</title></channel></rss>';
    const transport = transportOf(() => ok(quiet));

    await expect(fetchAnnouncements(installed, 'iliashhn', feed, transport)).resolves.toEqual([]);
  });

  it('names the feed password when ILIAS rejects it', async () => {
    const transport = transportOf(() => status(401));

    await expect(fetchAnnouncements(installed, 'iliashhn', feed, transport)).rejects.toMatchObject({
      kind: 'credentials-rejected',
    });
    await expect(fetchAnnouncements(installed, 'iliashhn', feed, transport)).rejects.toThrowError(
      /feed password/,
    );
  });
});

describe('transport failures', () => {
  it('lets a network failure through as a network failure', async () => {
    const transport = vi.fn().mockRejectedValue(new IliasError('network', 'offline'));

    await expect(fetchCourses(installed, session, transport)).rejects.toMatchObject({
      kind: 'network',
    });
  });
});
