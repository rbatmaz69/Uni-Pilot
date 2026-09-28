import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  File,
  Folder,
  FolderOpen,
  GraduationCap,
  House,
  Plus,
  School,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { NewBadge } from './NewBadge';
import {
  documentRequest,
  editable,
  type DirectoryListing,
  type DocumentEntry,
  type IliasCourse,
  type SearchHit,
} from '@/features/documents/lib/files';
import { COURSE_DRAG, courseCards, inIliasSpace } from '@/features/documents/lib/iliasSpace';
import { useCourseStore } from '@/features/courses/store/courseStore';
import {
  COURSES_SPACE,
  DOCUMENTS,
  ILIAS,
  ILIAS_SPACE,
  looseFiles,
  resolveSpace,
  spaceFolders,
  spaceTones,
  type Space,
} from '@/features/documents/lib/spaces';
import { useSpaceStore } from '@/features/documents/store/spaceStore';
import { IliasBadge } from '@/features/integrations';
import { cn } from '@/lib/utils';

type Props = {
  desktop: boolean;
  activePath: string;
  activeFile: string | null;
  /** Changes whenever the workspace may have changed, to list it again. */
  revision: number;
  onFolder: (path: string) => void;
  onFile: (entry: DocumentEntry) => void;
  /** Starts a note in the folder of the open space. */
  onNewNote: (folder: string) => void;
  onNewSpace: () => void;
  onEditSpace: (space: Space) => void;
  /** The courses the ILIAS sync keeps; `null` while they are read. */
  iliasCourses: IliasCourse[] | null;
  /** Opens the ILIAS space, or a course's synced folder, as a list. */
  onIlias: (path: string) => void;
  /** The course open in the ILIAS space, if one is. */
  iliasCourseId?: string | null;
  onIliasCourse?: (courseId: string) => void;
  /** A course dropped onto Documents: its files are to come into Documents. */
  onAddCourse?: (courseId: string) => void;
};

function SpaceIcon({ id, space, size }: { id: string; space?: Space | undefined; size: number }) {
  if (id === DOCUMENTS) return <House size={size} aria-hidden />;
  if (id === ILIAS) return <School size={size} aria-hidden />;
  if (space?.folder === COURSES_SPACE) return <GraduationCap size={size} aria-hidden />;
  return (
    <span className="space-monogram" aria-hidden>
      {(space?.name ?? '').charAt(0).toLocaleUpperCase()}
    </span>
  );
}

/** How many new files lie in a listed folder: its folders count what is below them. */
function unseenIn(entries: DocumentEntry[] | undefined): number {
  return (entries ?? []).reduce((sum, entry) => sum + (entry.unseen ?? 0), 0);
}

/**
 * The documents sidebar, one space at a time. Documents shows the whole
 * workspace, ILIAS the synced courses, and every space the student added one
 * folder. A space shows its folders one level deep and the notes lying loose
 * in it; deeper structure is the explorer's. The only number anywhere is how
 * many files are new.
 */
export function SpaceSidebar({
  desktop,
  activePath,
  activeFile,
  revision,
  onFolder,
  onFile,
  onNewNote,
  onNewSpace,
  onEditSpace,
  iliasCourses,
  onIlias,
  iliasCourseId = null,
  onIliasCourse,
  onAddCourse,
}: Props) {
  const listedCourses = useCourseStore((state) => state.courses);
  const [dropping, setDropping] = useState(false);
  const spaces = useSpaceStore((state) => state.spaces);
  const picked = useSpaceStore((state) => state.picked);
  const setPicked = useSpaceStore((state) => state.pick);
  const removeSpace = useSpaceStore((state) => state.removeSpace);
  const [lists, setLists] = useState<Record<string, DocumentEntry[]>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  // Folders the student closed; every folder of a space starts open.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const requested = useRef(new Map<string, number>());

  const courses = iliasCourses ?? [];
  const current = activeFile ?? activePath;
  const spaceId = resolveSpace(current, spaces, picked, (path) => inIliasSpace(path, courses));
  const ilias = spaceId === ILIAS;
  const added = spaces.find((space) => space.id === spaceId);
  const folder = added?.folder ?? '';
  const name = ilias ? 'ILIAS' : (added?.name ?? 'Documents');
  const entries = ilias ? [] : (lists[folder] ?? []);
  const folders = spaceFolders(entries);
  const files = looseFiles(entries);
  const iliasUnseen = courses.reduce((sum, course) => sum + course.unseen, 0);
  const iliasRows = courseCards(listedCourses?.items ?? [], courses);
  const isOpen = (path: string) => !closed.has(path) || current.startsWith(`${path}/`);
  const open = folders.filter((item) => isOpen(item.path)).map((item) => item.path);
  // The open space, its open folders, and every added space for its dock badge.
  const wanted = [
    ...new Set([...(ilias ? [] : [folder, ...open]), ...spaces.map((space) => space.folder)]),
  ];
  // JSON, since `''` (the whole workspace) is a folder to list too.
  const wantedKey = JSON.stringify(wanted);

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
          if (active) setSearchError(String(cause));
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [desktop, query]);

  // The space open at the start counts as picked, so walking into a folder that
  // is a space of its own keeps the sidebar where it is. Once the courses are
  // known: a synced folder opened from Courses starts in ILIAS.
  useEffect(() => {
    if (picked === null && iliasCourses !== null) setPicked(spaceId);
  }, [picked, iliasCourses, spaceId, setPicked]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);

  function toggle(path: string) {
    setClosed((existing) => {
      const next = new Set(existing);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function select(entry: DocumentEntry) {
    setQuery('');
    if (entry.folder) onFolder(entry.path);
    else onFile(entry);
  }

  function pick(id: string) {
    setPicked(id);
    setMenu(false);
    if (id === ILIAS) onIlias(ILIAS_SPACE);
    else onFolder(spaces.find((space) => space.id === id)?.folder ?? '');
  }

  function row(entry: DocumentEntry, depth: number, disclosure: boolean) {
    const expanded = disclosure && isOpen(entry.path);
    const Icon = entry.folder ? (expanded ? FolderOpen : Folder) : File;
    const active = activeFile === entry.path || (!activeFile && activePath === entry.path);
    return (
      <div key={entry.path}>
        <div
          className={cn('document-tree-row', active && 'is-active')}
          style={{ paddingLeft: `${8 + depth * 18}px` }}
        >
          {disclosure ? (
            <button
              type="button"
              className="document-tree-disclosure"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
              aria-expanded={expanded}
              onClick={() => toggle(entry.path)}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
          <button
            type="button"
            className="document-tree-name"
            title={entry.name}
            aria-current={active ? 'page' : undefined}
            onClick={() => select(entry)}
          >
            {/* Notes go without an icon, as in the concept; folders and other files keep theirs. */}
            {entry.folder || !editable(entry) ? (
              <Icon size={16} strokeWidth={1.8} aria-hidden />
            ) : null}
            <span>{entry.name.replace(/\.(md|markdown)$/i, '')}</span>
            {entry.ilias === 'root' && <IliasBadge size="sm" showLabel={false} />}
            {/* Keeps the badge a word of its own in the name; flex layout drops the space. */}
            {entry.unseen ? ' ' : null}
            <NewBadge count={entry.unseen} file={!entry.folder} className="ml-auto" />
          </button>
        </div>
        {expanded && (
          <div role="group" aria-label={entry.name}>
            {!lists[entry.path] ? <p className="document-tree-hint">Loading…</p> : null}
            {spaceFolders(lists[entry.path] ?? []).map((child) => row(child, depth + 1, false))}
            {looseFiles(lists[entry.path] ?? []).map((child) => row(child, depth + 1, false))}
          </div>
        )}
      </div>
    );
  }

  const search = query.trim();
  const hits = !search ? [] : results?.query === search ? results.hits : null;
  const missing = !ilias ? failed[folder] : undefined;

  // A course dragged out of the ILIAS space lands in Documents.
  const takesCourses = (id: string) => id === DOCUMENTS && !!onAddCourse;
  function dockButton(id: string, label: string, unseen: number, space?: Space) {
    const drops = takesCourses(id);
    const carries = (event: DragEvent) => event.dataTransfer.types.includes(COURSE_DRAG);
    return (
      <button
        key={id}
        type="button"
        className={cn('space-dock-button', drops && dropping && 'is-drop-target')}
        aria-label={unseen ? `${label}, ${unseen} new` : label}
        aria-pressed={spaceId === id}
        title={drops && dropping ? 'Drop to add the course to Documents' : (space?.name ?? label)}
        onClick={() => pick(id)}
        onDragOver={
          drops
            ? (event) => {
                if (!carries(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setDropping(true);
              }
            : undefined
        }
        onDragLeave={drops ? () => setDropping(false) : undefined}
        onDrop={
          drops
            ? (event) => {
                setDropping(false);
                const courseId = event.dataTransfer.getData(COURSE_DRAG);
                if (!courseId) return;
                event.preventDefault();
                onAddCourse?.(courseId);
              }
            : undefined
        }
      >
        <SpaceIcon id={id} space={space} size={17} />
        <NewBadge count={unseen} className="space-dock-badge" />
      </button>
    );
  }

  return (
    <aside
      className="document-tree space-sidebar"
      data-tone={added ? spaceTones(spaces.map((space) => space.name)).get(added.name) : undefined}
      aria-label="Document spaces"
    >
      <div className="document-tree-search">
        <Search size={16} aria-hidden />
        <input
          aria-label="Search all documents"
          placeholder="Search files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="document-tree-scroll scroll-area">
        {search ? (
          <>
            <p className="document-tree-heading">Search results</p>
            {search.length < 2 ? (
              <p className="document-tree-hint">Type one more letter</p>
            ) : hits === null ? (
              <p className="document-tree-hint">Searching…</p>
            ) : hits.length ? (
              hits.map((hit) => row(hit, 0, false))
            ) : (
              <p className="document-tree-hint">No matching files</p>
            )}
            {searchError && (
              <p role="alert" className="document-tree-hint text-danger">
                {searchError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="space-title-row" ref={menuRef}>
              <h2 className="space-title">
                <button
                  type="button"
                  aria-current={
                    !activeFile && activePath === (ilias ? ILIAS_SPACE : folder)
                      ? 'page'
                      : undefined
                  }
                  onClick={() => (ilias ? onIlias(ILIAS_SPACE) : onFolder(folder))}
                >
                  <SpaceIcon id={spaceId} space={added} size={17} />
                  <span>{name}</span>
                </button>
              </h2>
              {added ? (
                <>
                  <button
                    type="button"
                    className="space-options"
                    aria-label="Space options"
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                  >
                    <Ellipsis size={16} />
                  </button>
                  {menu ? (
                    <div className="space-menu" role="menu" aria-label={`${added.name} space`}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(false);
                          onEditSpace(added);
                        }}
                      >
                        Edit space
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(false);
                          removeSpace(added.id);
                        }}
                      >
                        Remove from the dock
                        <span>The folder and its files stay.</span>
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            {ilias ? (
              <>
                {iliasRows.map((row) => {
                  const synced = row.synced;
                  const active =
                    iliasCourseId === row.refId ||
                    (!!synced &&
                      (current === synced.root || current.startsWith(`${synced.root}/`)));
                  return (
                    <div key={row.refId} className={cn('document-tree-row', active && 'is-active')}>
                      <button
                        type="button"
                        className={cn('document-tree-name', !synced && 'is-remote')}
                        title={row.title}
                        aria-current={active ? 'page' : undefined}
                        onClick={() =>
                          onIliasCourse ? onIliasCourse(row.refId) : synced && onIlias(synced.root)
                        }
                      >
                        <Folder size={16} strokeWidth={1.8} aria-hidden />
                        <span>{row.name}</span>
                        {synced?.unseen ? ' ' : null}
                        <NewBadge count={synced?.unseen} className="ml-auto" />
                      </button>
                    </div>
                  );
                })}
                {iliasCourses !== null && !iliasRows.length ? (
                  <p className="document-tree-hint">No courses from ILIAS yet.</p>
                ) : null}
              </>
            ) : missing ? (
              <div className="document-tree-hint">
                <p role="alert">This space’s folder is missing: {folder}</p>
                {added ? (
                  <button
                    type="button"
                    className="mt-1 text-accent"
                    onClick={() => onEditSpace(added)}
                  >
                    Choose another folder
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {folders.map((item) => row(item, 0, true))}
                <div className="space-divider" />
                <button type="button" className="space-new-note" onClick={() => onNewNote(folder)}>
                  <Plus size={15} aria-hidden />
                  New note
                </button>
                {files.map((file) => row(file, 0, false))}
              </>
            )}
          </>
        )}
      </div>
      <div className={cn('document-tree-row space-trash', activePath === '.trash' && 'is-active')}>
        <button type="button" className="document-tree-name" onClick={() => onFolder('.trash')}>
          <Trash2 size={15} aria-hidden />
          <span>Recently deleted</span>
        </button>
      </div>
      <nav className="space-dock" aria-label="Spaces">
        <div className="space-dock-spaces">
          {dockButton(DOCUMENTS, 'Documents', 0)}
          {dockButton(ILIAS, 'ILIAS', iliasUnseen)}
          {spaces.length ? <span className="space-dock-divider" aria-hidden /> : null}
          {spaces.map((space) =>
            dockButton(space.id, `${space.name} space`, unseenIn(lists[space.folder]), space),
          )}
        </div>
        <button
          type="button"
          className="space-dock-button"
          aria-label="New space"
          title="New space"
          onClick={onNewSpace}
        >
          <Plus size={17} />
        </button>
      </nav>
    </aside>
  );
}
