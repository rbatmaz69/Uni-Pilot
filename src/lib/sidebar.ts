import { NAV_ITEMS } from '@/lib/navigation';
import type { NavSection } from '@/types';

/** A folder or document the student keeps in the sidebar. Paths are relative to Documents. */
export interface SidebarFavorite {
  path: string;
  name: string;
  folder: boolean;
}

/** Checks the shape of a favorite arriving from outside, e.g. a drag payload. */
function parseFavorite(value: unknown): SidebarFavorite | null {
  if (!value || typeof value !== 'object') return null;
  const { path, name, folder } = value as Record<string, unknown>;
  if (typeof path !== 'string' || !path || typeof name !== 'string') return null;
  if (path === '.trash' || path.startsWith('.trash/')) return null;
  return { path, name, folder: folder === true };
}

/**
 * Where a favorite leads: its folder, or its note opened over the folder it
 * lies in. Documents follows these like any other link to it.
 */
export function favoriteHref(favorite: SidebarFavorite) {
  const folder = favorite.folder ? favorite.path : favorite.path.split('/').slice(0, -1).join('/');
  const params = new URLSearchParams();
  if (folder) params.set('path', folder);
  if (!favorite.folder) params.set('file', favorite.path);
  const query = params.toString();
  return query ? `${NAV_ITEMS.documents.path}?${query}` : NAV_ITEMS.documents.path;
}

/** The student's changes to the configured sections: order per section and hidden entries. */
export interface SidebarLayout {
  order: Readonly<Record<string, readonly string[]>>;
  hidden: readonly string[];
}

/** Carries a document from the explorer into the sidebar. */
export const DOCUMENT_DRAG_TYPE = 'application/x-uni-pilot-document';

/** Marks the sidebar as a place documents can be dropped on, including pointer-driven drags. */
export const FAVORITES_DROP_ATTRIBUTE = 'data-favorites-drop';

/**
 * One drag type per list, so a list only lights up for its own entries: the
 * payload is unreadable until drop, but the type list is visible while dragging.
 */
export function sidebarDragType(list: string) {
  return `application/x-uni-pilot-sidebar-${list}`;
}

export function hasDragType(transfer: DataTransfer | null, type: string) {
  return Array.from(transfer?.types ?? []).includes(type);
}

export function toFavorite(entry: SidebarFavorite): SidebarFavorite {
  return { path: entry.path, name: entry.name, folder: entry.folder };
}

export function writeDocumentDrag(transfer: DataTransfer, entry: SidebarFavorite) {
  transfer.setData(DOCUMENT_DRAG_TYPE, JSON.stringify(toFavorite(entry)));
  transfer.setData('text/plain', entry.name);
  transfer.effectAllowed = 'link';
}

export function readDocumentDrag(transfer: DataTransfer | null): SidebarFavorite | null {
  try {
    return parseFavorite(JSON.parse(transfer?.getData(DOCUMENT_DRAG_TYPE) || 'null'));
  } catch {
    return null;
  }
}

/**
 * Pointer-driven drags (the document canvas) capture the pointer, so the
 * sidebar never sees them. They ask here whether they are over it instead.
 */
export function isOverFavorites(x: number, y: number) {
  if (typeof document.elementFromPoint !== 'function') return false;
  return Boolean(document.elementFromPoint(x, y)?.closest(`[${FAVORITES_DROP_ATTRIBUTE}]`));
}

/** Notes read better without their extension; other files keep it to tell PDF from slides. */
export function favoriteLabel(favorite: SidebarFavorite) {
  return favorite.folder ? favorite.name : favorite.name.replace(/\.(md|markdown|txt)$/i, '');
}

/** Whether `path` is `parent` itself or lies somewhere inside it. */
export function isWithin(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`);
}

/** Follows a rename or move: the entry itself and, for folders, everything inside. */
export function relocate(path: string, from: string, to: string) {
  return isWithin(path, from) ? `${to}${path.slice(from.length)}` : path;
}

/**
 * Moves `key` in front of `before`, or to the end when `before` is null.
 * Positions are keys rather than indexes, so hidden entries keep their place.
 */
export function placeBefore(keys: readonly string[], key: string, before: string | null) {
  if (key === before) return [...keys];
  const rest = keys.filter((item) => item !== key);
  const index = before === null ? -1 : rest.indexOf(before);
  if (index === -1) return [...rest, key];
  return [...rest.slice(0, index), key, ...rest.slice(index)];
}

/**
 * The student's order for a section. Entries a later release adds, and so
 * are missing from a saved order, come last; saved paths that no longer
 * exist are dropped.
 */
export function orderedPaths(section: NavSection, order: SidebarLayout['order']) {
  const configured = section.items.map((item) => item.path);
  const saved = (order[section.id] ?? []).filter((path) => configured.includes(path));
  return [...saved, ...configured.filter((path) => !saved.includes(path))];
}

/** Applies the student's order and hidden entries to the configured sections. */
export function arrangeSections(
  sections: readonly NavSection[],
  layout: SidebarLayout,
): NavSection[] {
  const hidden = new Set(layout.hidden);
  return sections.map((section) => {
    const byPath = new Map(section.items.map((item) => [item.path, item]));
    const items = orderedPaths(section, layout.order)
      .filter((path) => !hidden.has(path))
      .flatMap((path) => byPath.get(path) ?? []);
    return { ...section, items };
  });
}

/**
 * The key a visible entry should move in front of to step one place up or
 * down. Hidden entries are skipped, so the step is always one the student sees.
 */
export function neighbourTarget(
  visible: readonly string[],
  key: string,
  direction: 'up' | 'down',
): string | null | undefined {
  const index = visible.indexOf(key);
  if (index === -1) return undefined;
  if (direction === 'up') return index === 0 ? undefined : visible[index - 1];
  if (index === visible.length - 1) return undefined;
  return visible[index + 2] ?? null;
}
