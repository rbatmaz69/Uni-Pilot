import type { DocumentEntry } from '@/features/documents/lib/files';
import { spaceFolders } from '@/features/documents/lib/spaces';

/**
 * Which folders of the sidebar tree the student opened (`true`) or closed
 * (`false`). A folder not in here follows its default: the folders at the top
 * of a space start open, every deeper one closed.
 */
export type OpenFolders = Record<string, boolean>;

/** Every folder above a path, outermost first: `a/b/c.md` lies in `a` and `a/b`. */
export function foldersAbove(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** Opens the folders above `path`, so walking to a note or folder shows where it lies. */
export function reveal(open: OpenFolders, path: string): OpenFolders {
  const closed = foldersAbove(path).filter((folder) => open[folder] !== true);
  if (!closed.length) return open;
  return { ...open, ...Object.fromEntries(closed.map((folder) => [folder, true])) };
}

/** Whether a folder shows its contents; `depth` 0 is a folder at the top of the space. */
export function isFolderOpen(open: OpenFolders, path: string, depth: number): boolean {
  return open[path] ?? depth === 0;
}

/**
 * The folders the tree shows open, from the space's folder down — the ones
 * whose contents it needs. A folder's own contents only count once it is
 * listed, so the tree reads one level at a time.
 */
export function openFolders(
  root: string,
  lists: Readonly<Record<string, DocumentEntry[]>>,
  open: OpenFolders,
): string[] {
  const found: string[] = [];
  const walk = (folder: string, depth: number) => {
    for (const entry of spaceFolders(lists[folder] ?? [])) {
      if (!isFolderOpen(open, entry.path, depth)) continue;
      found.push(entry.path);
      walk(entry.path, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** Closes every folder listed so far. */
export function closeAll(lists: Readonly<Record<string, DocumentEntry[]>>): OpenFolders {
  return Object.fromEntries(
    Object.values(lists)
      .flat()
      .filter((entry) => entry.folder)
      .map((entry) => [entry.path, false]),
  );
}
