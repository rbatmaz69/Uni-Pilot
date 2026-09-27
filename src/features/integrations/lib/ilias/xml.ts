/**
 * Small reading helpers shared by the ILIAS mappers.
 *
 * `DOMParser` is used rather than a dependency: it is there in the webview and
 * in the jsdom test environment, and `src/lib/ics.ts` already sets the
 * precedent that parsing a well-known format is not worth a package.
 *
 * Every helper is defensive on purpose. ILIAS pretty-prints some documents and
 * not others, so a `<Title>` can arrive wrapped in newlines, and optional
 * elements are emitted empty rather than omitted.
 */

import { IliasError } from './errors';

export function parseXmlDocument(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  // A parse failure is reported as a document rather than thrown.
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new IliasError('unreadable-response', 'ILIAS returned a document that is not valid XML.');
  }
  return document;
}

/** Trimmed text of the first matching child, or null when there is none. */
export function textOf(parent: Element | Document, tagName: string): string | null {
  const value = parent.getElementsByTagName(tagName)[0]?.textContent?.trim();
  return value ? value : null;
}

/** Like `textOf`, but only for a direct child — `Title` appears at many depths. */
export function childText(parent: Element, tagName: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      const value = child.textContent?.trim();
      return value ? value : null;
    }
  }
  return null;
}

export function attributeOf(element: Element | null | undefined, name: string): string | null {
  const value = element?.getAttribute(name)?.trim();
  return value ? value : null;
}

/**
 * ILIAS writes dates in two shapes and Uni Pilot stores one. Unix seconds come
 * from the XML writers (`Period/Start`, `Assignment/DueDate`); the
 * `YYYY-MM-DD HH:MM:SS` form comes from the repository tree, where it is the
 * server's local time with no zone attached — it is read as UTC, which is the
 * assumption to revisit once a real installation can be compared against.
 */
export function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    // ILIAS writes 0 for "not set" as readily as it omits the element.
    if (!seconds) return null;
    return new Date(seconds * 1000).toISOString();
  }

  const parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (parts) return `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.000Z`;

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * ILIAS object ids look like `il_12895_crs_5584`: instance, type, object id.
 * Only the trailing number is useful, and only next to the installation.
 */
export function objectIdOf(value: string | null): string | null {
  return /(?:^|_)(\d+)$/.exec(value ?? '')?.[1] ?? null;
}
