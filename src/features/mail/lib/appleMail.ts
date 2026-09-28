/**
 * Apple Mail — the TypeScript side of `src-tauri/src/apple_mail.rs`.
 *
 * Uni Pilot reads the university mailbox by asking Apple Mail on this Mac,
 * which is signed in to Microsoft 365 already. The page asks Rust; Rust asks
 * Mail; nothing talks to Microsoft. What comes back is the overview with a
 * one-line preview, and the text of the message the student opens — held in
 * memory, never stored. What goes the other way is a draft for Mail to open.
 * Sending is always the student's click, in Mail.
 */

export interface MailAccount {
  name: string;
  addresses: string[];
}

export interface MailMessage {
  /** The Message-ID, without angle brackets. */
  id: string;
  /**
   * Mail's own number for the message, which finds it again in one step. Null
   * when Mail gave none; the Message-ID is searched for then.
   */
  mailId: number | null;
  subject: string;
  /** As Mail gives it: `Name <address>` or just the address. */
  sender: string;
  /** ISO 8601, UTC. */
  receivedAt: string | null;
  read: boolean;
  /** The start of the text, one line. */
  snippet: string;
  /** How many files are attached. */
  attachments: number;
}

/** Which message: its Message-ID, and Mail's own number when the list had one. */
export type MessageRef = Pick<MailMessage, 'id' | 'mailId'>;

/** Just the two — a listed message carries more than Mail needs to be told. */
const refOf = ({ id, mailId }: MessageRef): MessageRef => ({ id, mailId });

export interface MailAttachment {
  name: string;
  /** Bytes, when Mail knows them. */
  size: number | null;
}

/** The message the student opened. */
export interface MailBody {
  id: string;
  subject: string;
  sender: string;
  to: string[];
  cc: string[];
  receivedAt: string | null;
  read: boolean;
  /** Plain text, as Mail gives it. */
  content: string;
  attachments: MailAttachment[];
}

export interface MailDraft {
  /** The address to send from; Mail's default account otherwise. */
  from: string | null;
  to: string[];
  subject: string;
  body: string;
}

/** `MailError` in `src-tauri/src/apple_mail.rs`. */
export type MailFailureKind =
  'unsupported' | 'notRunning' | 'notAllowed' | 'noAccount' | 'noMessage' | 'invalid' | 'failed';

/** Why Mail gave nothing, with a sentence the page can show. */
export class MailFailure extends Error {
  readonly kind: MailFailureKind;

  constructor(kind: MailFailureKind, message: string) {
    super(message);
    this.name = 'MailFailure';
    this.kind = kind;
  }
}

const MESSAGES: Record<MailFailureKind, string> = {
  unsupported: 'University mail comes through Apple Mail, which is only on a Mac.',
  notRunning: 'Apple Mail is not open.',
  notAllowed: 'Uni Pilot may not ask Apple Mail yet.',
  noAccount: 'That account is no longer in Apple Mail.',
  noMessage: 'That message is no longer in your inbox.',
  invalid: 'That could not be passed to Apple Mail.',
  failed: 'Apple Mail did not answer.',
};

/** What Rust answered, with a sentence the page can show. */
export function toMailFailure(cause: unknown): MailFailure {
  const kind = (cause as { kind?: unknown } | null)?.kind;
  const detail = (cause as { message?: unknown } | null)?.message;
  if (typeof kind === 'string' && kind in MESSAGES) {
    const known = kind as MailFailureKind;
    return new MailFailure(
      known,
      (known === 'invalid' || known === 'failed') && typeof detail === 'string'
        ? detail
        : MESSAGES[known],
    );
  }
  return new MailFailure('failed', typeof cause === 'string' ? cause : MESSAGES.failed);
}

const loadCore = () => import('@tauri-apps/api/core');
/**
 * Tauri's bridge, loaded on first use and shared: calls come several at a
 * time (previews beside an opened message), and two imports at once can each
 * resolve it anew — vitest 5 then hands one of them the real module, not the
 * test's stand-in.
 */
let core: ReturnType<typeof loadCore> | undefined;

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  core ??= loadCore();
  const { invoke } = await core;
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    throw toMailFailure(cause);
  }
}

export function listMailAccounts(): Promise<MailAccount[]> {
  return call('mail_accounts');
}

/** The newest messages of an account's inbox. Listing marks nothing read. */
export function readInbox(account: string): Promise<MailMessage[]> {
  return call('mail_inbox', { account });
}

/** Opens a message in Mail, which marks it read, as reading it there would. */
export function openInMail(id: string): Promise<void> {
  return call('mail_open', { id });
}

export function launchMail(): Promise<void> {
  return call('mail_launch');
}

export interface MailPreview {
  snippet: string;
  attachments: number;
}

/**
 * Previews for listed messages, by id. Mail fetches an Exchange message's text
 * when asked, so this answers with those it got within its time budget.
 */
export function readPreviews(
  account: string,
  messages: readonly MessageRef[],
): Promise<Record<string, MailPreview>> {
  return call('mail_previews', { account, messages: messages.map(refOf) });
}

/** The text of one message, and its attachments. Held in memory only. */
export function readMessage(account: string, message: MessageRef): Promise<MailBody> {
  return call('mail_message', { account, message: refOf(message) });
}

/** Marks a message read or unread in Mail. */
export function markRead(account: string, message: MessageRef, read: boolean): Promise<void> {
  return call('mail_mark_read', { account, message: refOf(message), read });
}

/**
 * Opens a reply in Mail, with `text` above the quote where Mail takes it.
 * Answers whether it did; the student sends.
 */
export function replyInMail(account: string, message: MessageRef, text?: string): Promise<boolean> {
  return call('mail_reply', { account, message: refOf(message), text: text?.trim() ? text : null });
}

/** Opens a filled-in message in Mail. The student sends it. */
export function composeInMail(draft: MailDraft): Promise<void> {
  return call('mail_compose', { draft });
}
