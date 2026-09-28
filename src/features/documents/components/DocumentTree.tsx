import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  documentRequest,
  editable,
  type DirectoryListing,
  type DocumentEntry,
  type SearchHit,
} from '@/features/documents/lib/files';
import { IliasBadge } from '@/features/integrations';
import { cn } from '@/lib/utils';

type Props = {
  desktop: boolean;
  rootEntries: DocumentEntry[];
  activePath: string;
  activeFile: string | null;
  revision: number;
  onFolder: (path: string) => void;
  onFile: (entry: DocumentEntry) => void;
};

export function DocumentTree({
  desktop,
  rootEntries,
  activePath,
  activeFile,
  revision,
  onFolder,
  onFile,
}: Props) {
  const [folders, setFolders] = useState<Record<string, DocumentEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [error, setError] = useState('');
  const openFolders = new Set(expanded);
  if (activePath && activePath !== '.trash') {
    const parts = activePath.split('/');
    for (let index = 1; index <= parts.length; index++)
      openFolders.add(parts.slice(0, index).join('/'));
  }

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    const paths = new Set(expanded);
    if (activePath && activePath !== '.trash') {
      const parts = activePath.split('/');
      for (let index = 1; index <= parts.length; index++)
        paths.add(parts.slice(0, index).join('/'));
    }
    for (const path of paths) {
      if (!path) continue;
      void documentRequest<DirectoryListing>({ action: 'list', path })
        .then((listing) => {
          if (active) {
            setFolders((current) => ({ ...current, [path]: listing.entries }));
            setError('');
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(String(cause));
        });
    }
    return () => {
      active = false;
    };
  }, [desktop, revision, expanded, activePath]);

  useEffect(() => {
    const search = query.trim();
    if (!desktop || search.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void documentRequest<SearchHit[]>({ action: 'search', query: search })
        .then((hits) => {
          if (active) setResults({ query: search, hits });
        })
        .catch((cause: unknown) => {
          if (active) setError(String(cause));
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [desktop, query]);

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const search = query.trim().toLocaleLowerCase();
  const matches = search
    ? desktop && search.length >= 2
      ? results?.query === query.trim()
        ? results.hits
        : null
      : Object.values({ ...folders, '': rootEntries })
          .flat()
          .filter(
            (entry, index, all) =>
              entry.name.toLocaleLowerCase().includes(search) &&
              all.findIndex((other) => other.path === entry.path) === index,
          )
    : [];

  function item(entry: DocumentEntry, depth: number) {
    const open = openFolders.has(entry.path);
    const Icon = entry.folder ? (open ? FolderOpen : Folder) : editable(entry) ? FileText : File;
    const current = activeFile === entry.path || (!activeFile && activePath === entry.path);
    return (
      <div key={entry.path}>
        <div
          className={cn('document-tree-row', current && 'is-active')}
          style={{ paddingLeft: `${12 + depth * 17}px` }}
        >
          {entry.folder ? (
            <button
              type="button"
              className="document-tree-disclosure"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${entry.name}`}
              aria-expanded={open}
              onClick={() => toggle(entry.path)}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="document-tree-disclosure" />
          )}
          <button
            type="button"
            className="document-tree-name"
            title={entry.name}
            aria-current={current ? 'page' : undefined}
            onClick={() => {
              setQuery('');
              if (entry.folder) onFolder(entry.path);
              else onFile(entry);
            }}
          >
            <Icon size={17} strokeWidth={1.8} aria-hidden />
            <span>{entry.name}</span>
            {entry.ilias === 'root' && <IliasBadge size="sm" showLabel={false} />}
          </button>
        </div>
        {entry.folder && open && (
          <div role="group" aria-label={entry.name}>
            {!folders[entry.path] ? <p className="document-tree-hint">Loading…</p> : null}
            {(folders[entry.path] ?? []).map((child) => item(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="document-tree" aria-label="Document folders">
      <div className="document-tree-search">
        <Search size={16} aria-hidden />
        <input
          aria-label="Search folder tree"
          placeholder="Search files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Clear folder search" onClick={() => setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="document-tree-scroll scroll-area">
        {search ? (
          <>
            <p className="document-tree-heading">Search results</p>
            {matches === null ? (
              <p className="document-tree-hint">Searching…</p>
            ) : matches.length ? (
              matches.map((entry) => item(entry, 0))
            ) : (
              <p className="document-tree-hint">No matching files</p>
            )}
          </>
        ) : (
          <>
            <p className="document-tree-heading">Library</p>
            <div
              className={cn(
                'document-tree-row document-tree-root',
                !activeFile && !activePath && 'is-active',
              )}
            >
              <button
                type="button"
                className="document-tree-disclosure"
                aria-label="Toggle Documents"
                aria-expanded={openFolders.has('')}
                onClick={() => toggle('')}
              >
                {openFolders.has('') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                type="button"
                className="document-tree-name"
                aria-current={!activeFile && !activePath ? 'page' : undefined}
                onClick={() => onFolder('')}
              >
                <FolderOpen size={17} aria-hidden />
                <span>Documents</span>
              </button>
            </div>
            {openFolders.has('') && rootEntries.map((entry) => item(entry, 0))}
            <div className="document-tree-divider" />
            <div
              className={cn(
                'document-tree-row document-tree-root',
                activePath === '.trash' && 'is-active',
              )}
            >
              <span className="document-tree-disclosure" />
              <button
                type="button"
                className="document-tree-name"
                onClick={() => onFolder('.trash')}
              >
                <Trash2 size={16} aria-hidden />
                <span>Recently deleted</span>
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="document-tree-hint text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="document-tree-foot">Stored on this computer</div>
    </aside>
  );
}
