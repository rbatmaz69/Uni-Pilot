import { describe, expect, it } from 'vitest';
import type { MailMessage } from './appleMail';
import {
  categoryOf,
  courseFor,
  courseRefs,
  formatBytes,
  formatReceived,
  groupByDay,
  initials,
  matchesFilter,
  matchesSearch,
  parseSender,
  toneFor,
  universityAccount,
  universityAddress,
  universityDomain,
} from './mail';

function message(overrides: Partial<MailMessage>): MailMessage {
  return {
    id: 'x@hs-heilbronn.de',
    subject: '',
    sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
    receivedAt: '2026-09-25T09:12:00.000Z',
    read: true,
    snippet: '',
    attachments: 0,
    ...overrides,
  };
}

const REFS = courseRefs([
  { refId: '967849', title: '262058 Datenbanken 1 - WS25' },
  {
    refId: '16697',
    title: '262026 Weiterführende Programmiersprachen / Further Programming Languages',
  },
  {
    refId: '1036829',
    title: '261835/262135 Praktisches Studiensemester und Praktikantenkolloquium 2026 WS',
  },
]);

const ACCOUNTS = [
  { name: 'iCloud', addresses: ['me@icloud.com'] },
  { name: 'stud.hs-heilbronn.de', addresses: ['student@stud.hs-heilbronn.de'] },
];

describe('finding the university account', () => {
  it('takes the domain from the ILIAS address', () => {
    expect(universityDomain('https://ilias.hs-heilbronn.de')).toBe('hs-heilbronn.de');
    expect(universityDomain(null)).toBeNull();
    expect(universityDomain('not a url')).toBeNull();
  });

  it('finds the account with an address below that domain', () => {
    expect(universityAccount(ACCOUNTS, 'hs-heilbronn.de')?.name).toBe('stud.hs-heilbronn.de');
    expect(universityAccount(ACCOUNTS, 'uni-stuttgart.de')).toBeNull();
    expect(universityAccount(ACCOUNTS, null)).toBeNull();
  });

  it('is not fooled by a look-alike domain', () => {
    const lookalike = [{ name: 'x', addresses: ['me@evil-hs-heilbronn.de'] }];
    expect(universityAccount(lookalike, 'hs-heilbronn.de')).toBeNull();
  });

  it('sends drafts from the university address', () => {
    const both = { name: 'Uni', addresses: ['me@icloud.com', 'student@stud.hs-heilbronn.de'] };
    expect(universityAddress(both, 'hs-heilbronn.de')).toBe('student@stud.hs-heilbronn.de');
  });
});

describe('reading a message line', () => {
  it('splits the sender Mail gives into name and address', () => {
    expect(parseSender('Prof. Beispiel <prof@hs-heilbronn.de>')).toEqual({
      name: 'Prof. Beispiel',
      address: 'prof@hs-heilbronn.de',
    });
    expect(parseSender('"Studienbüro, HHN" <sb@hs-heilbronn.de>').name).toBe('Studienbüro, HHN');
    expect(parseSender('prof@hs-heilbronn.de')).toEqual({
      name: 'prof@hs-heilbronn.de',
      address: 'prof@hs-heilbronn.de',
    });
  });

  it('dates a message by how far back it is', () => {
    const now = new Date(2026, 8, 25, 14, 0);
    expect(formatReceived(new Date(2026, 8, 25, 9, 12).toISOString(), now)).toBe('09:12');
    expect(formatReceived(new Date(2026, 8, 24, 9, 12).toISOString(), now)).toBe('24 Sep');
    expect(formatReceived(new Date(2025, 2, 3).toISOString(), now)).toBe('3 Mar 2025');
    expect(formatReceived(null, now)).toBe('');
  });
});

describe('sorting the inbox', () => {
  it('tells the university, fellow students, ILIAS and everyone else apart', () => {
    const domain = 'hs-heilbronn.de';
    expect(categoryOf(message({}), domain)).toBe('university');
    expect(categoryOf(message({ sender: 'Mia <mia@stud.hs-heilbronn.de>' }), domain)).toBe(
      'students',
    );
    expect(
      categoryOf(message({ sender: 'ILIAS HHN <noreply-ilias@hs-heilbronn.de>' }), domain),
    ).toBe('ilias');
    expect(categoryOf(message({ subject: '[ILIAS] Neue Datei' }), domain)).toBe('ilias');
    expect(categoryOf(message({ sender: 'Amazon <shop@amazon.de>' }), domain)).toBe('other');
  });

  it('finds the course a message is about, by module number or name', () => {
    expect(courseFor(message({ subject: 'Klausur 262058 verschoben' }), REFS)?.refId).toBe(
      '967849',
    );
    expect(courseFor(message({ subject: 'Frage zu Datenbanken 1' }), REFS)?.refId).toBe('967849');
    expect(courseFor(message({ subject: 'Anmeldung 262135' }), REFS)?.refId).toBe('1036829');
    expect(courseFor(message({ subject: 'Mensa-Plan' }), REFS)).toBeNull();
    // A number that merely contains a module number is not it.
    expect(courseFor(message({ subject: 'Ticket 12620589' }), REFS)).toBeNull();
  });

  it('names a course without its semester', () => {
    expect(REFS.find((ref) => ref.refId === '967849')?.key).toBe('Datenbanken 1');
  });

  it('filters by unread, sorting, sender and course, and searches every word', () => {
    const context = { domain: 'hs-heilbronn.de', refs: REFS, triage: { a: 'reply' as const } };
    const unread = message({ id: 'a', read: false, subject: 'Datenbanken 1: Blatt 4' });
    expect(matchesFilter(unread, 'unread', context)).toBe(true);
    expect(matchesFilter(unread, 'reply', context)).toBe(true);
    expect(matchesFilter(unread, 'university', context)).toBe(true);
    expect(matchesFilter(unread, 'course:967849', context)).toBe(true);
    expect(matchesFilter(unread, 'course:16697', context)).toBe(false);
    expect(matchesSearch(unread, 'blatt prof')).toBe(true);
    expect(matchesSearch(unread, 'klausur')).toBe(false);
  });

  it('groups by day, newest first', () => {
    const now = new Date(2026, 8, 25, 14, 0);
    const at = (day: number) => new Date(2026, 8, day, 9, 0).toISOString();
    const groups = groupByDay(
      [
        message({ id: '1', receivedAt: at(25) }),
        message({ id: '2', receivedAt: at(24) }),
        message({ id: '3', receivedAt: at(21) }),
        message({ id: '4', receivedAt: at(2) }),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.messages.length])).toEqual([
      ['Today', 1],
      ['Yesterday', 1],
      ['This week', 1],
      ['Earlier', 1],
    ]);
  });

  it('gives each sender initials and a tone of their own', () => {
    expect(initials('Prof. Dr. Anna Beispiel')).toBe('AB');
    expect(initials('Studienbüro')).toBe('S');
    expect(initials('prof@hs-heilbronn.de')).toBe('P');
    expect(initials('anna.beispiel@hs-heilbronn.de')).toBe('AB');
    expect(toneFor('Anna')).toBe(toneFor('anna'));
    expect(formatBytes(81234)).toBe('79 KB');
    expect(formatBytes(null)).toBeNull();
  });
});
