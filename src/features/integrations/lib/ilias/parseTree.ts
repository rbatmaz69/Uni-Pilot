/**
 * ILIAS repository objects -> Uni Pilot's ExternalItem.
 *
 * `getTreeChilds` answers with an `<Objects>` document: one `<Object>` per
 * child, each carrying the object's own data plus a `<References>` block with
 * the reference id, the parent, and — usefully — the operations the calling
 * account holds on it. That last part means a listing already knows whether a
 * download will be allowed, without a second call that fails.
 */

import type { ExternalItem, ExternalItemKind, ExternalOrigin } from '../types';
import { objectUrl } from './endpoints';
import { childText, parseXmlDocument, toIsoDate } from './xml';

export interface TreeMappingContext {
  origin: ExternalOrigin;
  baseUrl: string;
}

/**
 * ILIAS has dozens of object types and Uni Pilot shows a handful of shapes.
 * Anything unmapped stays `other` and keeps its `providerType`, so adding a
 * type later is a change here and nowhere else.
 */
const KIND_BY_TYPE: Readonly<Record<string, ExternalItemKind>> = {
  fold: 'folder',
  cat: 'folder',
  itgr: 'folder',
  file: 'file',
  webr: 'link',
  lm: 'learning-module',
  htlm: 'learning-module',
  sahs: 'learning-module',
  copa: 'learning-module',
  exc: 'exercise',
  tst: 'test',
  crs: 'course',
  grp: 'group',
};

export function parseTreeChildren(xml: string, context: TreeMappingContext): ExternalItem[] {
  const document = parseXmlDocument(xml);

  const items: ExternalItem[] = [];
  for (const object of Array.from(document.getElementsByTagName('Object'))) {
    const providerType = object.getAttribute('type')?.trim() ?? '';
    const reference = object.getElementsByTagName('References')[0] ?? null;
    const refId = reference?.getAttribute('ref_id')?.trim();
    // Without a reference id nothing further can be requested for this object,
    // so it is dropped rather than carried as an item that cannot be opened.
    if (!refId) continue;

    items.push({
      origin: context.origin,
      externalId: refId,
      kind: KIND_BY_TYPE[providerType] ?? 'other',
      title: childText(object, 'Title') ?? 'Untitled',
      description: childText(object, 'Description'),
      parentExternalId: reference?.getAttribute('parent_id')?.trim() ?? null,
      providerType,
      updatedAt: toIsoDate(childText(object, 'LastUpdate')),
      permissions: Array.from(reference?.getElementsByTagName('Operation') ?? [])
        .map((operation) => operation.textContent?.trim() ?? '')
        .filter((operation) => operation !== ''),
      url: objectUrl(context.baseUrl, refId, providerType || 'crs'),
    });
  }
  return items;
}

/** Whether the calling account may actually open an item, per ILIAS itself. */
export function isReadable(item: ExternalItem): boolean {
  return item.permissions.includes('read');
}
