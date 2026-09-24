import { describe, expect, it } from 'vitest';
import {
  calendarSubscriptionUrl,
  layoutForRelease,
  majorRelease,
  normaliseBaseUrl,
  dashboardUrl,
  objectUrl,
  privateNewsFeedUrl,
  resolveIliasTarget,
  soapEndpoint,
  soapEndpointCandidates,
} from './endpoints';

describe('majorRelease', () => {
  it.each([
    ['9.23', 9],
    ['10.11 2026-09-03', 10],
    ['8', 8],
    ['11.0.1', 11],
  ])('reads %s as release %i', (version, expected) => {
    expect(majorRelease(version)).toBe(expected);
  });

  it('returns null for something that is not a version', () => {
    expect(majorRelease('unknown')).toBeNull();
    expect(majorRelease('')).toBeNull();
  });
});

describe('layoutForRelease', () => {
  // ILIAS 10 moved the web root into public/, which shortened the SOAP path.
  it('puts release 9 and older on the legacy layout', () => {
    expect(layoutForRelease(8)).toBe('legacy');
    expect(layoutForRelease(9)).toBe('legacy');
  });

  it('puts release 10 and newer on the public root layout', () => {
    expect(layoutForRelease(10)).toBe('public-root');
    expect(layoutForRelease(11)).toBe('public-root');
  });
});

describe('normaliseBaseUrl', () => {
  it('keeps a plain installation address unchanged', () => {
    expect(normaliseBaseUrl('https://ilias.hs-heilbronn.de')).toBe('https://ilias.hs-heilbronn.de');
  });

  it('drops the page a student pasted along with the address', () => {
    expect(
      normaliseBaseUrl(
        'https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&ref_id=1',
      ),
    ).toBe('https://ilias.hs-heilbronn.de');
  });

  it('assumes https for a bare host and drops a trailing slash', () => {
    expect(normaliseBaseUrl('ilias.hs-heilbronn.de/')).toBe('https://ilias.hs-heilbronn.de');
  });

  it('keeps an installation that lives in a subdirectory', () => {
    expect(normaliseBaseUrl('https://example.edu/ilias/login.php')).toBe(
      'https://example.edu/ilias',
    );
  });

  // Stored addresses get normalised again on the way out. Dropping the last
  // segment unconditionally turned `…/ilias` into the bare host the second time.
  it('leaves an already normalised subdirectory alone', () => {
    expect(normaliseBaseUrl('https://example.edu/ilias')).toBe('https://example.edu/ilias');
    expect(normaliseBaseUrl(normaliseBaseUrl('https://example.edu/ilias/login.php'))).toBe(
      'https://example.edu/ilias',
    );
  });

  it('returns an empty string for junk rather than throwing', () => {
    expect(normaliseBaseUrl('   ')).toBe('');
    expect(normaliseBaseUrl('http://')).toBe('');
  });
});

describe('soapEndpoint', () => {
  it('matches the path observed on a release 9 installation', () => {
    expect(soapEndpoint('https://ilias.hs-heilbronn.de', 'legacy')).toBe(
      'https://ilias.hs-heilbronn.de/webservice/soap/server.php',
    );
  });

  it('matches the path observed on a release 10 installation', () => {
    expect(soapEndpoint('https://demo.ilias.de', 'public-root')).toBe(
      'https://demo.ilias.de/soap/server.php',
    );
  });

  it('offers the newer path first when the release is not known yet', () => {
    expect(soapEndpointCandidates('https://demo.ilias.de')).toEqual([
      'https://demo.ilias.de/soap/server.php',
      'https://demo.ilias.de/webservice/soap/server.php',
    ]);
  });
});

describe('token-based URLs', () => {
  it('builds the iCal subscription address', () => {
    expect(calendarSubscriptionUrl('https://ilias.hs-heilbronn.de', 'iliashhn', 'abc123')).toBe(
      'https://ilias.hs-heilbronn.de/calendar.php?client_id=iliashhn&token=abc123',
    );
  });

  it('builds the private news feed address', () => {
    expect(
      privateNewsFeedUrl('https://ilias.hs-heilbronn.de', 'iliashhn', '4711', 'deadbeef'),
    ).toBe(
      'https://ilias.hs-heilbronn.de/privfeed.php?client_id=iliashhn&user_id=4711&hash=deadbeef',
    );
  });

  it('escapes a token rather than pasting it into the query', () => {
    expect(calendarSubscriptionUrl('https://example.edu', 'c', 'a b&c')).toContain('token=a+b%26c');
  });

  it('builds a deep link for any object type', () => {
    expect(objectUrl('https://demo.ilias.de', '717', 'crs')).toBe(
      'https://demo.ilias.de/goto.php?target=crs_717',
    );
  });

  it('adds the client to a deep link when it knows it', () => {
    expect(objectUrl('https://ilias.hs-heilbronn.de', '717', 'crs', 'iliashhn')).toBe(
      'https://ilias.hs-heilbronn.de/goto.php?target=crs_717&client_id=iliashhn',
    );
  });
});

describe('dashboardUrl', () => {
  // The root of the Heilbronn installation redirects to the public repository,
  // signed out. The dashboard is the page that means "my ILIAS".
  it('points at the dashboard, not the root', () => {
    expect(dashboardUrl('https://ilias.hs-heilbronn.de', 'iliashhn')).toBe(
      'https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn',
    );
  });
});

/**
 * The same cases are tested against `resolve_target` in
 * src-tauri/src/ilias_window.rs. If one of these changes, change it there too —
 * the desktop window and the browser tab must agree on what they will open.
 */
describe('resolveIliasTarget', () => {
  const base = 'https://ilias.hs-heilbronn.de';
  const client = 'iliashhn';

  it('opens the dashboard when there is no target', () => {
    expect(resolveIliasTarget(base, client)).toBe(
      'https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn',
    );
    expect(resolveIliasTarget(base, client, '   ')).toBe(
      'https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn',
    );
  });

  it('turns a goto shorthand into a deep link', () => {
    expect(resolveIliasTarget(base, client, 'crs_717')).toBe(
      'https://ilias.hs-heilbronn.de/goto.php?target=crs_717&client_id=iliashhn',
    );
  });

  it('accepts a link from the same installation and adds the client', () => {
    expect(
      resolveIliasTarget(base, client, 'https://ilias.hs-heilbronn.de/goto.php?target=exc_42'),
    ).toBe('https://ilias.hs-heilbronn.de/goto.php?target=exc_42&client_id=iliashhn');
  });

  it('keeps a link that already names the right client', () => {
    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_42&client_id=iliashhn';
    expect(resolveIliasTarget(base, client, link)).toBe(link);
  });

  it('refuses a link that names a different client', () => {
    expect(() =>
      resolveIliasTarget(base, client, 'https://ilias.hs-heilbronn.de/goto.php?client_id=other'),
    ).toThrowError(/different ILIAS client/);
  });

  // Deep links arrive inside calendar feeds. A feed must not be able to open an
  // arbitrary page in the window a student is about to sign in through.
  it.each([
    ['another host', 'https://evil.example/login'],
    ['a look-alike host', 'https://ilias.hs-heilbronn.de.evil.example/'],
    ['plain http', 'http://ilias.hs-heilbronn.de/goto.php?target=crs_1'],
    ['a different port', 'https://ilias.hs-heilbronn.de:8443/'],
    ['javascript', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,hello'],
    ['a file URL', 'file:///etc/passwd'],
  ])('refuses %s', (_label, target) => {
    expect(() => resolveIliasTarget(base, client, target)).toThrowError();
  });

  it('refuses an installation that is not on https', () => {
    expect(() => resolveIliasTarget('http://ilias.hs-heilbronn.de', client)).toThrowError(/https/);
  });

  it('refuses an installation address that carries credentials', () => {
    expect(() => resolveIliasTarget('https://user:pw@ilias.example', client)).toThrowError(
      /username or password/,
    );
  });

  it('refuses a client id that would break out of the query', () => {
    expect(() => resolveIliasTarget(base, 'hhn&baseClass=x')).toThrowError(/client name/);
  });

  it('keeps a subdirectory installation in the path', () => {
    expect(resolveIliasTarget('https://example.edu/ilias', 'c', 'crs_5')).toBe(
      'https://example.edu/ilias/goto.php?target=crs_5&client_id=c',
    );
  });
});
