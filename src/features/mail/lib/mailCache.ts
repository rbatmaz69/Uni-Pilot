/**
 * The newest mail, kept on this Mac — the TypeScript side of
 * `src-tauri/src/mail_cache.rs`.
 *
 * At start the Inbox shows the list it last had, and the newest messages open
 * without waiting for Mail; Mail is asked for what is new behind them. Rust
 * encrypts the copy and holds it to these limits; this file decides what goes
 * in. Failing to read or write the copy is never the student's problem: the
 * Inbox then asks Mail, as it always did.
 */

import {
  call,
  type MailBody,
  type MailMessage,
  type MailPreview,
} from '@/features/mail/lib/appleMail';

/** The Inbox lists this many; all of them are kept, with their previews. */
export const LIST_KEPT = 50;
/** Texts kept, the newest messages': about a week of university mail. */
export const TEXTS_KEPT = 25;

export interface MailCache {
  /** The Mail account it came from; another account's copy is not shown. */
  account: string;
  messages: MailMessage[];
  bodies: MailBody[];
}

/** Newest first; a message without a date last. */
export function newestFirst(messages: readonly MailMessage[]): MailMessage[] {
  return [...messages].sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''));
}

/** What to keep: the list as shown, and the texts Mail gave of its newest messages. */
export function cacheOf(
  account: string,
  messages: readonly MailMessage[],
  bodies: Readonly<Record<string, MailBody>>,
): MailCache {
  const listed = newestFirst(messages).slice(0, LIST_KEPT);
  return {
    account,
    messages: listed,
    bodies: listed.slice(0, TEXTS_KEPT).flatMap((message) => bodies[message.id] ?? []),
  };
}

/** The newest messages whose text Mail has not given yet, newest first. */
export function textsToFetch(
  messages: readonly MailMessage[],
  bodies: Readonly<Record<string, MailBody>>,
): MailMessage[] {
  return newestFirst(messages)
    .slice(0, TEXTS_KEPT)
    .filter((message) => !bodies[message.id]);
}

/**
 * The previews a kept list already carries, so Mail is not asked for them
 * again. A message kept before its preview came has none, and is asked about.
 */
export function previewsOf(messages: readonly MailMessage[]): Record<string, MailPreview> {
  return Object.fromEntries(
    messages
      .filter((message) => message.snippet !== '' || message.attachments > 0)
      .map((message) => [
        message.id,
        {
          snippet: message.snippet,
          attachments: message.attachments,
          ...(message.attachmentNames ? { attachmentNames: message.attachmentNames } : {}),
        },
      ]),
  );
}

export async function readMailCache(): Promise<MailCache | null> {
  try {
    return (await call<MailCache | null>('mail_cache_read')) ?? null;
  } catch {
    // Refused in the Keychain, or no copy that opens: the Inbox asks Mail.
    return null;
  }
}

export async function writeMailCache(cache: MailCache): Promise<void> {
  try {
    await call('mail_cache_write', { cache });
  } catch {
    // Not kept this time; the Inbox works without.
  }
}

export async function clearMailCache(): Promise<void> {
  try {
    await call('mail_cache_clear');
  } catch {
    // A copy that stays unread expires on its own after 30 days.
  }
}
