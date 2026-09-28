import type { DocumentEntry } from '@/features/documents/lib/files';

/**
 * The dock holds two spaces that are always there — Documents, the whole
 * workspace, and ILIAS — and the ones the student adds: a name for a folder
 * of the workspace. Which spaces there are is an app setting (`spaceStore`),
 * never written into the files.
 */
export interface Space {
  id: string;
  name: string;
  /** Workspace-relative folder the space shows; never the workspace itself. */
  folder: string;
}

/** The space of the whole workspace. */
export const DOCUMENTS = 'documents';
/** The space of the courses the ILIAS sync keeps. */
export const ILIAS = 'ilias';

/**
 * Where the ILIAS space opens in the explorer: no folder, since it gathers the
 * courses wherever their folders are. Never sent to the workspace as a path.
 */
export const ILIAS_SPACE = ':ilias';

/** The folder the ILIAS course sync fills (`mirror::COURSES` in Rust). */
export const COURSES_SPACE = 'Courses';

/** The hues a space can take, each a soft token pair in `globals.css`. */
export const SPACE_TONES = [
  'lavender',
  'green',
  'blue',
  'yellow',
  'pink',
  'teal',
  'orange',
  'coral',
] as const;
export type SpaceTone = (typeof SPACE_TONES)[number];

function hash(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + char.codePointAt(0)!) >>> 0;
  return value;
}

/**
 * A hue for every space. The hue follows the name, not the position, so a
 * space mostly keeps its hue when others come and go; two spaces meeting on
 * one hue, the later by name takes the next free one.
 */
export function spaceTones(names: string[]): Map<string, SpaceTone> {
  const tones = new Map<string, SpaceTone>();
  const taken = new Set<SpaceTone>();
  for (const name of [...names].sort()) {
    const start = hash(name) % SPACE_TONES.length;
    let tone = SPACE_TONES[start] ?? 'lavender';
    for (let step = 0; step < SPACE_TONES.length && taken.has(tone); step++)
      tone = SPACE_TONES[(start + step + 1) % SPACE_TONES.length] ?? tone;
    if (taken.size >= SPACE_TONES.length) taken.clear();
    taken.add(tone);
    tones.set(name, tone);
  }
  return tones;
}

/** Whether `path` lies in `folder` (`''` holding the whole workspace). */
export function within(folder: string, path: string): boolean {
  if (path === ILIAS_SPACE) return false;
  return !folder || path === folder || path.startsWith(`${folder}/`);
}

/**
 * The space to show for an open folder or file. The space the student picked
 * stays while the path lies in it — Documents holds everything — so walking
 * into a folder never swaps the sidebar. Otherwise ILIAS for a synced folder,
 * the closest added space, or Documents.
 */
export function resolveSpace(
  path: string,
  spaces: Space[],
  picked: string | null,
  inIlias: (path: string) => boolean,
): string {
  if (path === ILIAS_SPACE) return ILIAS;
  const holds = (id: string) =>
    id === ILIAS
      ? inIlias(path)
      : id === DOCUMENTS || spaces.some((space) => space.id === id && within(space.folder, path));
  if (picked && holds(picked)) return picked;
  if (inIlias(path)) return ILIAS;
  const closest = spaces
    .filter((space) => within(space.folder, path))
    .sort((a, b) => b.folder.length - a.folder.length)[0];
  return closest?.id ?? DOCUMENTS;
}

const byName = (a: DocumentEntry, b: DocumentEntry) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/** Folders of a space, by name. */
export function spaceFolders(entries: DocumentEntry[]): DocumentEntry[] {
  return entries.filter((entry) => entry.folder).sort(byName);
}

/** Files lying loose in a space, the latest first — what "Clean up" would file away. */
export function looseFiles(entries: DocumentEntry[]): DocumentEntry[] {
  return entries
    .filter((entry) => !entry.folder)
    .sort((a, b) => b.modified - a.modified || byName(a, b));
}
