/**
 * What the Inbox makes of Apple Mail's answers. Pure, so it is tested without
 * Mail or Tauri.
 */

import { MONTH_NAMES, differenceInDays, formatTimeAgo, isSameDay, startOfDay } from '@/lib/date';
import { splitCourseTitle } from '@/features/courses/lib/courses';
import type { MailAccount, MailMessage } from '@/features/mail/lib/appleMail';

/**
 * The university's mail domain, from its ILIAS address:
 * `https://ilias.hs-heilbronn.de` → `hs-heilbronn.de`. Student addresses sit
 * below it (`stud.hs-heilbronn.de`), so a match on the ending finds them.
 */
export function universityDomain(iliasBaseUrl: string | null | undefined): string | null {
  if (!iliasBaseUrl) return null;
  try {
    const labels = new URL(iliasBaseUrl).hostname.split('.');
    return labels.length >= 2 ? labels.slice(-2).join('.') : null;
  } catch {
    return null;
  }
}

function belongsTo(address: string, domain: string): boolean {
  const host = address.trim().toLowerCase().split('@')[1] ?? '';
  return host === domain || host.endsWith(`.${domain}`);
}

/** The Mail account with an address at the university, if there is one. */
export function universityAccount(
  accounts: readonly MailAccount[],
  domain: string | null,
): MailAccount | null {
  if (!domain) return null;
  return (
    accounts.find((account) => account.addresses.some((address) => belongsTo(address, domain))) ??
    null
  );
}

/** The account's own address at the university — what a draft is sent from. */
export function universityAddress(account: MailAccount, domain: string | null): string | null {
  return (
    (domain ? account.addresses.find((address) => belongsTo(address, domain)) : undefined) ??
    account.addresses[0] ??
    null
  );
}

/** `"Prof. Beispiel" <prof@hs-heilbronn.de>` → name and address. */
export function parseSender(sender: string): { name: string; address: string | null } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(sender);
  if (match) {
    const address = match[2]?.trim() ?? null;
    return { name: match[1]?.trim() || address || sender, address };
  }
  const bare = sender.trim();
  return { name: bare, address: bare.includes('@') ? bare : null };
}

/** Today a time, this year a day, before that a date: `09:12`, `24 Sep`, `3 Mar 2025`. */
export function formatReceived(receivedAt: string | null, now: Date): string {
  if (!receivedAt) return '';
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return '';
  if (isSameDay(date, now)) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  const month = (MONTH_NAMES[date.getMonth()] ?? '').slice(0, 3);
  return date.getFullYear() === now.getFullYear()
    ? `${date.getDate()} ${month}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** For the freshness line: `Updated 3 min ago`. */
export function formatChecked(checkedAt: string | null, now: Date): string {
  return checkedAt ? `Updated ${formatTimeAgo(new Date(checkedAt), now)}` : 'Not read yet';
}

// --- sorting the inbox ------------------------------------------------------

/** Who a message is from, as far as a student cares. */
export type MailCategory = 'university' | 'students' | 'ilias' | 'other';

export const CATEGORY_LABELS: Record<MailCategory, string> = {
  university: 'University',
  students: 'Students',
  ilias: 'ILIAS',
  other: 'Other',
};

/**
 * ILIAS by its sender or its `[ILIAS …]` subject; the university by an address
 * at its domain, fellow students by its `stud.` subdomain; everything else.
 */
export function categoryOf(
  message: Pick<MailMessage, 'sender' | 'subject'>,
  domain: string | null,
): MailCategory {
  const { name, address } = parseSender(message.sender);
  if (/ilias/i.test(address ?? '') || /^ilias\b/i.test(name) || /\[ilias/i.test(message.subject)) {
    return 'ilias';
  }
  const host = (address ?? '').toLowerCase().split('@')[1] ?? '';
  if (domain && (host === domain || host.endsWith(`.${domain}`))) {
    return host.startsWith('stud.') ? 'students' : 'university';
  }
  return 'other';
}

/** A course as the Inbox recognises it in a subject. */
export interface CourseRef {
  refId: string;
  code: string | null;
  /** The name without its semester: `Datenbanken 1`, not `Datenbanken 1 - WS25`. */
  key: string;
  name: string;
}

export function courseRefs(courses: readonly { refId: string; title: string }[]): CourseRef[] {
  return courses
    .map((course) => {
      const { code, name } = splitCourseTitle(course.title);
      const key = (name.split(/\s[-–(]\s?|\s(?:WS|SS|SoSe|WiSe)\s?\d/)[0] ?? name).trim();
      return { refId: course.refId, code, key, name };
    })
    .sort((a, b) => b.key.length - a.key.length);
}

/** The course a message is about: its module number, or its name, in the subject or preview. */
export function courseFor(
  message: Pick<MailMessage, 'subject' | 'snippet'>,
  refs: readonly CourseRef[],
): CourseRef | null {
  const text = `${message.subject} ${message.snippet}`.toLowerCase();
  return (
    refs.find(
      (ref) =>
        ref.code?.split('/').some((code) => new RegExp(`\\b${code}\\b`).test(text)) ||
        (ref.key.length >= 6 && text.includes(ref.key.toLowerCase())),
    ) ?? null
  );
}

export type TriageState = 'reply' | 'waiting' | 'done';

export const TRIAGE_LABELS: Record<TriageState, string> = {
  reply: 'Needs reply',
  waiting: 'Waiting',
  done: 'Done',
};

export type MailFilter = 'all' | 'unread' | 'reply' | MailCategory | `course:${string}`;

export interface FilterContext {
  domain: string | null;
  refs: readonly CourseRef[];
  triage: Readonly<Record<string, TriageState>>;
}

export function matchesFilter(
  message: MailMessage,
  filter: MailFilter,
  context: FilterContext,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !message.read;
  if (filter === 'reply') return context.triage[message.id] === 'reply';
  if (filter.startsWith('course:')) {
    return courseFor(message, context.refs)?.refId === filter.slice('course:'.length);
  }
  return categoryOf(message, context.domain) === filter;
}

/** Sender, subject or preview containing every word typed. */
export function matchesSearch(message: MailMessage, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${message.sender} ${message.subject} ${message.snippet}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

export interface DayGroup<T> {
  label: 'Today' | 'Yesterday' | 'This week' | 'Earlier';
  messages: T[];
}

/** Newest first, under Today, Yesterday, This week and Earlier. */
export function groupByDay<T extends Pick<MailMessage, 'receivedAt'>>(
  messages: readonly T[],
  now: Date,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const message of messages) {
    const date = message.receivedAt ? new Date(message.receivedAt) : null;
    const age = date ? differenceInDays(startOfDay(now), startOfDay(date)) : Infinity;
    const label = age <= 0 ? 'Today' : age === 1 ? 'Yesterday' : age < 7 ? 'This week' : 'Earlier';
    const last = groups.at(-1);
    if (last?.label === label) last.messages.push(message);
    else groups.push({ label, messages: [message] });
  }
  return groups;
}

/**
 * `Prof. Dr. Anna Beispiel` → `AB`: the first and last word that start with a
 * letter, titles aside. A bare address counts by what is before the `@`:
 * `anna.beispiel@…` → `AB`.
 */
export function initials(name: string): string {
  const cleaned = name.replace(/["<>]/g, '').trim();
  const address = cleaned.includes('@') && !/\s/.test(cleaned);
  const words = (address ? (cleaned.split('@')[0] ?? '') : cleaned)
    .split(/[\s._-]+/)
    .filter((word) => /^\p{L}/u.test(word) && (address || !/^(prof|dr|mr|mrs|ms)$/i.test(word)));
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

const TONES = [
  'bg-accent-soft text-accent',
  'bg-blue-soft text-blue',
  'bg-green-soft text-green',
  'bg-orange-soft text-orange',
  'bg-lavender-soft text-lavender',
  'bg-teal-soft text-teal',
  'bg-pink-soft text-pink',
] as const;

/** The same sender always wears the same tone. */
export function toneFor(key: string): string {
  let hash = 0;
  for (const character of key.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0];
}

/** `81234` → `79 KB`, for attachment cards. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
