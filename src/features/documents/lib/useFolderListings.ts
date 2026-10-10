import { useEffect, useRef, useState } from 'react';
import {
  documentRequest,
  type DirectoryListing,
  type DocumentEntry,
} from '@/features/documents/lib/files';

/**
 * What the folders it asks for hold, listed again whenever `revision` changes,
 * and which of them could not be read. `want` names the folders to list given
 * what is known so far, so a tree can ask for the next level once the one above
 * is in. A folder is only requested once per revision, however often the
 * answer changes around it.
 */
export function useFolderListings(
  desktop: boolean,
  revision: number,
  want: (lists: Readonly<Record<string, DocumentEntry[]>>) => readonly string[],
) {
  const [lists, setLists] = useState<Record<string, DocumentEntry[]>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const requested = useRef(new Map<string, number>());
  // JSON, since `''` (the whole workspace) is a folder to list too.
  const wantedKey = JSON.stringify(want(lists));

  useEffect(() => {
    if (!desktop) return;
    for (const path of JSON.parse(wantedKey) as string[]) {
      if (requested.current.get(path) === revision) continue;
      requested.current.set(path, revision);
      void documentRequest<DirectoryListing>({ action: 'list', path })
        .then((listing) => {
          setLists((existing) => ({ ...existing, [path]: listing.entries }));
          setFailed((existing) => {
            if (!(path in existing)) return existing;
            const next = { ...existing };
            delete next[path];
            return next;
          });
        })
        .catch((cause: unknown) => {
          requested.current.delete(path);
          setFailed((existing) => ({ ...existing, [path]: String(cause) }));
        });
    }
  }, [desktop, revision, wantedKey]);

  return { lists, failed };
}
