import { describe, expect, it } from 'vitest';
import {
  calendarSubscriptionUrl,
  layoutForRelease,
  majorRelease,
  normaliseBaseUrl,
  objectUrl,
  privateNewsFeedUrl,
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
});
