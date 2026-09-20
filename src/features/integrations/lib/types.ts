/**
 * Provider-agnostic shapes for data that originates in a university system.
 *
 * ILIAS is the first source, HISinOne is the expected second, and neither
 * should reach the rest of the app. Everything below is deliberately named
 * after what a student sees — a course, a file, an assignment — rather than
 * after the object types of whichever system it came from. The one concession
 * is `providerType`, which keeps the source's own vocabulary so a later
 * feature can act on it without another round of API research.
 *
 * These are read models. Nothing here is written back to the source system.
 */

/** One entry per integrated system. Widened when the next connector lands. */
export type ProviderId = 'ilias';

/**
 * Where a record came from.
 *
 * `installation` matters more than it looks: two universities both running
 * ILIAS will happily both call a course `717`, so an id is only unique next to
 * the installation that issued it.
 */
export interface ExternalOrigin {
  provider: ProviderId;
  /** Host of the installation, e.g. `ilias.hs-heilbronn.de`. */
  installation: string;
}

/** Anything that carries an identity in the source system. */
export interface ExternalRecord {
  origin: ExternalOrigin;
  /** The source's own identifier, as text. For ILIAS this is the `ref_id`. */
  externalId: string;
}

export interface ExternalPeriod {
  /** ISO 8601, or null when the source left it open. */
  start: string | null;
  end: string | null;
}

export interface ExternalCourse extends ExternalRecord {
  title: string;
  description: string | null;
  /** BCP-47-ish tag as the source reported it; not normalised. */
  language: string | null;
  /** Course runtime, where the source states one. */
  period: ExternalPeriod | null;
  /** Deep link into the source system, for the "open in ILIAS" fallback. */
  url: string | null;
}

/**
 * How Uni Pilot groups the many object types a learning management system
 * distinguishes. `other` is not a failure — it is the honest answer for the
 * long tail (polls, glossaries, media casts) that has no place in the UI yet.
 */
export type ExternalItemKind =
  | 'folder'
  | 'file'
  | 'link'
  | 'learning-module'
  | 'exercise'
  | 'test'
  | 'course'
  | 'group'
  | 'other';

export interface ExternalItem extends ExternalRecord {
  kind: ExternalItemKind;
  title: string;
  description: string | null;
  /** The containing object, so a tree can be rebuilt without re-fetching. */
  parentExternalId: string | null;
  /** The source's own type string (`fold`, `file`, `lm`, …). Never shown. */
  providerType: string;
  /** ISO 8601. The only field that supports change detection. */
  updatedAt: string | null;
  /**
   * What the signed-in person may do with this object, in the source's own
   * words (`visible`, `read`, `write`, …). ILIAS reports this per object, so
   * the UI can grey out a download instead of failing at click time.
   */
  permissions: readonly string[];
  url: string | null;
}

export interface ExternalAssignment extends ExternalRecord {
  /** The exercise the assignment belongs to. */
  parentExternalId: string;
  title: string;
  /** Plain text or HTML exactly as the source stored it. */
  instruction: string | null;
  /** ISO 8601, or null for an assignment without a deadline. */
  dueAt: string | null;
  attachments: readonly ExternalAttachment[];
  /** Deep link to the exercise, since assignments have no page of their own. */
  url: string | null;
}

export interface ExternalAttachment {
  filename: string;
  /** Bytes, when the source states a size. */
  size: number | null;
}

export interface ExternalAnnouncement extends ExternalRecord {
  title: string;
  body: string | null;
  /** ISO 8601. */
  publishedAt: string | null;
  url: string | null;
}
