import type { ReactNode } from 'react';
import { File, FileText, Folder } from 'lucide-react';
import { editable, type SearchHit } from '@/features/documents/lib/files';

function highlight(text: string, query: string): ReactNode[] {
  const needle = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  for (
    let found = lower.indexOf(needle);
    needle && found >= 0;
    found = lower.indexOf(needle, index)
  ) {
    parts.push(
      text.slice(index, found),
      <mark key={found}>{text.slice(found, found + needle.length)}</mark>,
    );
    index = found + needle.length;
  }
  parts.push(text.slice(index));
  return parts;
}

interface SearchResultsProps {
  query: string;
  hits: SearchHit[] | null;
  onOpen: (hit: SearchHit) => void;
}

/** Matches by name and by note text across the whole workspace. */
export function SearchResults({ query, hits, onOpen }: SearchResultsProps) {
  return (
    <section className="document-search-results" aria-label="Search results in all folders">
      <p className="document-search-heading" aria-live="polite">
        {hits === null
          ? 'Searching all folders…'
          : hits.length
            ? `${hits.length}${hits.length === 40 ? '+' : ''} ${hits.length === 1 ? 'match' : 'matches'} in all folders`
            : `Nothing in your notes mentions “${query.trim()}”.`}
      </p>
      {hits?.length ? (
        <ul>
          {hits.map((hit) => {
            const Icon = hit.folder ? Folder : editable(hit) ? FileText : File;
            const folder = hit.path.split('/').slice(0, -1).join(' / ');
            return (
              <li key={hit.path}>
                <button type="button" onClick={() => onOpen(hit)}>
                  <Icon size={15} aria-hidden className="document-search-icon" />
                  <span className="document-search-text">
                    <strong>{highlight(hit.name, query)}</strong>
                    <span className="document-search-folder">{folder || 'Documents'}</span>
                    {hit.snippet ? (
                      <span className="document-search-snippet">
                        {highlight(hit.snippet, query)}
                      </span>
                    ) : null}
                  </span>
                  {hit.matches > 1 ? (
                    <span className="document-search-count">{hit.matches}×</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
