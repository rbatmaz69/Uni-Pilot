import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  File,
  FileText,
  FolderPlus,
  House,
  Search,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { NewBadge } from './NewBadge';
import { FolderIcon } from './FolderIcon';
import { FolderAppearanceButton } from './FolderAppearanceButton';
import { SidebarFavorites } from './SidebarFavorites';
import { SpaceSwitcher } from './SpaceSwitcher';
import {
  PanelAction,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelItem,
} from '@/components/layout/Panel';
import {
  documentRequest,
  editable,
  type DocumentEntry,
  type IliasCourse,
  type SearchHit,
} from '@/features/documents/lib/files';
import { COURSE_DRAG, courseCards, inIliasSpace } from '@/features/documents/lib/iliasSpace';
import {
  closeAll,
  isFolderOpen,
  openFolders,
  reveal,
  type OpenFolders,
} from '@/features/documents/lib/sidebarTree';
import {
  ILIAS,
  ILIAS_SPACE,
  looseFiles,
  resolveSpace,
  spaceFolders,
  spaceTones,
  type Space,
} from '@/features/documents/lib/spaces';
import { useFavoritesDrop } from '@/features/documents/lib/useFavoritesDrop';
import { useFolderListings } from '@/features/documents/lib/useFolderListings';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useDocumentsLayoutStore } from '@/features/documents/store/documentsLayoutStore';
import { useSpaceStore } from '@/features/documents/store/spaceStore';
import { IliasBadge } from '@/features/integrations';
import { hasDragType, toFavorite, writeDocumentDrag } from '@/lib/sidebar';
import { cn } from '@/lib/utils';
import { panelMotionRef } from '@/components/layout/panelMotion';
import { useSidebarStore } from '@/store/sidebarStore';

/** How far each level of the tree steps in. */
const INDENT = 14;

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
  /** Starts a folder in the folder of the open space. */
  onNewFolder: (folder: string) => void;
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

/** How many new files lie in a listed folder: its folders count what is below them. */
function unseenIn(entries: DocumentEntry[] | undefined): number {
  return (entries ?? []).reduce((sum, entry) => sum + (entry.unseen ?? 0), 0);
}

/**
 * The documents sidebar, one space at a time. Documents shows the whole
 * workspace, ILIAS the synced courses, and every space the student added one
 * folder; the name at the top switches between them. Below sit the Files and
 * Favorites views and the tree: folders open to any depth, each read when it is first opened. The only number anywhere is how
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
  onNewFolder,
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
  const setDocumentDrag = useSidebarStore((state) => state.setDocumentDrag);
  const documentDrag = useSidebarStore((state) => state.documentDrag);
  const pointerOver = useSidebarStore((state) => state.documentDragOver);
  const spaces = useSpaceStore((state) => state.spaces);
  const picked = useSpaceStore((state) => state.picked);
  const setPicked = useSpaceStore((state) => state.pick);
  const removeSpace = useSpaceStore((state) => state.removeSpace);
  const view = useDocumentsLayoutStore((state) => state.sidebarView);
  const setView = useDocumentsLayoutStore((state) => state.setSidebarView);
  const favoritesDrop = useFavoritesDrop();
  const panelId = useId();
  const filesTabId = useId();
  const favoritesTabId = useId();
  const filesTab = useRef<HTMLButtonElement>(null);
  const favoritesTab = useRef<HTMLButtonElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const current = activeFile ?? activePath;
  // The student's own openings and closings. Walking to a note or folder opens
  // the folders above it, once; after that the student decides.
  const [openState, setOpenState] = useState<OpenFolders>(() => reveal({}, current));
  const [revealed, setRevealed] = useState(current);
  if (revealed !== current) {
    setRevealed(current);
    setOpenState(reveal(openState, current));
  }
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [searchError, setSearchError] = useState('');

  const courses = iliasCourses ?? [];
  const spaceId = resolveSpace(current, spaces, picked, (path) => inIliasSpace(path, courses));
  const ilias = spaceId === ILIAS;
  const added = spaces.find((space) => space.id === spaceId);
  const folder = added?.folder ?? '';
  const name = ilias ? 'ILIAS' : (added?.name ?? 'Documents');
  // The open space, its open folders at any depth, and every added space for its badge.
  const { lists, failed } = useFolderListings(desktop, revision, (known) => [
    ...new Set([
      ...(ilias ? [] : [folder, ...openFolders(folder, known, openState)]),
      ...spaces.map((space) => space.folder),
    ]),
  ]);
  const entries = ilias ? [] : (lists[folder] ?? []);
  const iliasUnseen = courses.reduce((sum, course) => sum + course.unseen, 0);
  const iliasRows = courseCards(listedCourses?.items ?? [], courses);
  const unseen: Record<string, number> = {
    [ILIAS]: iliasUnseen,
    ...Object.fromEntries(spaces.map((space) => [space.id, unseenIn(lists[space.folder])])),
  };
  const receiving = Boolean(documentDrag);
  const over = favoritesDrop.over || pointerOver;
  const showingFavorites = view === 'favorites';

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

  // The field takes the keyboard as it opens.
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  function setFolderOpen(path: string, open: boolean) {
    setOpenState((existing) => ({ ...existing, [path]: open }));
  }

  function closeSearch(restoreFocus = false) {
    setQuery('');
    setSearchOpen(false);
    if (restoreFocus) searchToggle.current?.focus();
  }

  function select(entry: DocumentEntry) {
    closeSearch();
    if (entry.folder) onFolder(entry.path);
    else onFile(entry);
  }

  function pick(id: string) {
    setPicked(id);
    if (id === ILIAS) onIlias(ILIAS_SPACE);
    else onFolder(spaces.find((space) => space.id === id)?.folder ?? '');
  }

  function switchView(next: 'files' | 'favorites', focus = false) {
    setView(next);
    if (focus) (next === 'files' ? filesTab : favoritesTab).current?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'files'
        : event.key === 'End'
          ? 'favorites'
          : showingFavorites
            ? 'files'
            : 'favorites';
    switchView(next, true);
  }

  function row(entry: DocumentEntry, depth: number, tree: boolean) {
    const disclosure = tree && entry.folder;
    const expanded = disclosure && isFolderOpen(openState, entry.path, depth);
    const Icon = editable(entry) ? FileText : File;
    const active = activeFile === entry.path || (!activeFile && activePath === entry.path);
    const children = lists[entry.path];
    const indent = depth * INDENT;
    return (
      <div key={entry.path}>
        <div
          className={cn('document-tree-row panel-row', active && 'is-active')}
          style={tree ? { paddingLeft: `${indent}px` } : undefined}
          draggable={desktop}
          onDragStart={(event) => {
            writeDocumentDrag(event.dataTransfer, entry);
            setDocumentDrag(toFavorite(entry));
          }}
          onDragEnd={() => setDocumentDrag(null)}
        >
          {disclosure ? (
            <button
              type="button"
              className="document-tree-disclosure"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
              aria-expanded={expanded}
              onClick={() => setFolderOpen(entry.path, !expanded)}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : tree ? (
            <span className="document-tree-disclosure" aria-hidden />
          ) : null}
          <button
            type="button"
            className="document-tree-name"
            title={entry.name}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              // A folder opened from the tree shows what is in it.
              if (disclosure && !expanded) setFolderOpen(entry.path, true);
              select(entry);
            }}
          >
            {entry.folder ? (
              <FolderIcon path={entry.path} open={expanded} />
            ) : (
              <Icon size={16} strokeWidth={1.8} aria-hidden />
            )}
            <span>{entry.name.replace(/\.(md|markdown)$/i, '')}</span>
            {entry.ilias === 'root' && <IliasBadge size="sm" showLabel={false} />}
            {/* Keeps the badge a word of its own in the name; flex layout drops the space. */}
            {entry.unseen ? ' ' : null}
            <NewBadge count={entry.unseen} file={!entry.folder} className="ml-auto" />
          </button>
          {entry.folder && <FolderAppearanceButton path={entry.path} name={entry.name} />}
        </div>
        {expanded && (
          <div role="group" aria-label={entry.name}>
            {children ? (
              <>
                {spaceFolders(children).map((child) => row(child, depth + 1, true))}
                {looseFiles(children).map((child) => row(child, depth + 1, true))}
                {!children.length ? (
                  <p className="document-tree-hint" style={{ paddingLeft: `${indent + 28}px` }}>
                    Empty folder
                  </p>
                ) : null}
              </>
            ) : (
              <p className="document-tree-hint" style={{ paddingLeft: `${indent + 28}px` }}>
                {failed[entry.path] ? 'This folder could not be read.' : 'Loading…'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const search = ilias ? '' : query.trim();
  const hits = !search ? [] : results?.query === search ? results.hits : null;
  const missing = !ilias ? failed[folder] : undefined;
  const overview = !activeFile && activePath === (ilias ? ILIAS_SPACE : folder);

  // A course dragged out of the ILIAS space lands in Documents: anywhere on the sidebar.
  const takesCourses = !!onAddCourse;
  const carriesCourse = (event: DragEvent) => hasDragType(event.dataTransfer, COURSE_DRAG);

  const filesPanel = (
    <div role="tabpanel" id={panelId} aria-labelledby={filesTabId} className="space-panel">
      {!ilias && (
        <>
          <div role="group" aria-label="Tree tools" className="space-toolbar">
            <button
              ref={searchToggle}
              type="button"
              className="space-tool"
              aria-label="Search all documents"
              title="Search all documents"
              aria-expanded={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            >
              <Search size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="space-tool"
              aria-label="Collapse all folders"
              title="Collapse all folders"
              onClick={() => setOpenState(closeAll(lists))}
            >
              <ChevronsDownUp size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="space-tool"
              aria-label="New folder"
              title="New folder"
              disabled={!desktop}
              onClick={() => onNewFolder(folder)}
            >
              <FolderPlus size={15} aria-hidden />
            </button>
          </div>
          {searchOpen && (
            <div className="document-tree-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchInput}
                aria-label="Search all documents"
                placeholder="Search files"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  closeSearch(true);
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    searchInput.current?.focus();
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </>
      )}
      <PanelBody>
        {search ? (
          <>
            <p className="panel-heading">Search results</p>
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
        ) : ilias ? (
          <>
            {iliasRows.map((course) => {
              const synced = course.synced;
              const active =
                iliasCourseId === course.refId ||
                (!!synced && (current === synced.root || current.startsWith(`${synced.root}/`)));
              return (
                <div
                  key={course.refId}
                  className={cn('document-tree-row panel-row', active && 'is-active')}
                >
                  <button
                    type="button"
                    className={cn('document-tree-name', !synced && 'is-remote')}
                    title={course.title}
                    aria-current={active ? 'page' : undefined}
                    onClick={() =>
                      onIliasCourse ? onIliasCourse(course.refId) : synced && onIlias(synced.root)
                    }
                  >
                    <FolderIcon path={`:ilias-course/${course.refId}`} name={course.name} />
                    <span>{course.name}</span>
                    {synced?.unseen ? ' ' : null}
                    <NewBadge count={synced?.unseen} className="ml-auto" />
                  </button>
                  <FolderAppearanceButton
                    path={`:ilias-course/${course.refId}`}
                    name={course.name}
                  />
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
              <button type="button" className="mt-1 text-accent" onClick={() => onEditSpace(added)}>
                Choose another folder
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {spaceFolders(entries).map((item) => row(item, 0, true))}
            {looseFiles(entries).map((item) => row(item, 0, true))}
          </>
        )}
      </PanelBody>
    </div>
  );

  return (
    <aside
      // Slides in and out like every section's panel (panelMotion).
      ref={panelMotionRef}
      className={cn('document-tree section-panel space-sidebar', dropping && 'is-drop-target')}
      data-tone={added ? spaceTones(spaces.map((space) => space.name)).get(added.name) : undefined}
      aria-label="Document spaces"
      onDragOver={
        takesCourses
          ? (event) => {
              if (!carriesCourse(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDropping(true);
            }
          : undefined
      }
      onDragLeave={
        takesCourses
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDropping(false);
            }
          : undefined
      }
      onDrop={
        takesCourses
          ? (event) => {
              setDropping(false);
              const courseId = event.dataTransfer.getData(COURSE_DRAG);
              if (!courseId) return;
              event.preventDefault();
              onAddCourse(courseId);
            }
          : undefined
      }
    >
      <PanelHeader
        switcher={
          <SpaceSwitcher
            spaceId={spaceId}
            name={name}
            added={added}
            spaces={spaces}
            unseen={unseen}
            onPick={pick}
            onNewSpace={onNewSpace}
            onEditSpace={onEditSpace}
            onRemoveSpace={(space) => removeSpace(space.id)}
          />
        }
        actions={
          <>
            <PanelAction
              label="Space overview"
              aria-current={overview ? 'page' : undefined}
              onClick={() => (ilias ? onIlias(ILIAS_SPACE) : onFolder(folder))}
            >
              <House size={16} strokeWidth={1.8} aria-hidden />
            </PanelAction>
            {!ilias && (
              <PanelAction label="New note" disabled={!desktop} onClick={() => onNewNote(folder)}>
                <SquarePen size={16} strokeWidth={1.8} aria-hidden />
              </PanelAction>
            )}
          </>
        }
      />
      {dropping && (
        <p role="status" className="space-drop-hint">
          Drop to add the course to Documents
        </p>
      )}
      <div
        role="tablist"
        aria-label="Sidebar view"
        className="space-views"
        onKeyDown={onTabKeyDown}
      >
        <button
          ref={filesTab}
          id={filesTabId}
          type="button"
          role="tab"
          aria-selected={!showingFavorites}
          aria-controls={panelId}
          tabIndex={showingFavorites ? -1 : 0}
          className="space-view"
          onClick={() => switchView('files')}
        >
          Files
        </button>
        <button
          ref={favoritesTab}
          id={favoritesTabId}
          type="button"
          role="tab"
          aria-selected={showingFavorites}
          aria-controls={panelId}
          tabIndex={showingFavorites ? 0 : -1}
          className={cn('space-view', receiving && 'is-receiving', over && 'is-over')}
          data-receiving={receiving || undefined}
          data-over={over || undefined}
          onClick={() => switchView('favorites')}
          {...favoritesDrop.props}
        >
          Favorites
        </button>
      </div>
      {showingFavorites ? (
        <SidebarFavorites
          id={panelId}
          role="tabpanel"
          aria-labelledby={favoritesTabId}
          activePath={activePath}
          activeFile={activeFile}
          onFolder={onFolder}
          onFile={onFile}
          receiving={receiving}
          over={over}
          {...favoritesDrop.props}
        />
      ) : (
        filesPanel
      )}
      <PanelFooter>
        <PanelItem
          icon={Trash2}
          label="Recently deleted"
          active={activePath === '.trash'}
          onClick={() => onFolder('.trash')}
        />
      </PanelFooter>
    </aside>
  );
}
