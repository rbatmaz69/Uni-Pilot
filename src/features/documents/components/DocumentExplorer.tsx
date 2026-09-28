import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  PanelsTopLeft,
  Plus,
  X,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Monitor,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DocumentCanvas } from './DocumentCanvas';
import { DocumentPreview } from './DocumentPreview';
import { DocumentTree } from './DocumentTree';
import { SearchResults } from './SearchResults';
import { StudyEditor } from './StudyEditor';
import { FileTools } from './FileTools';
import { Button, IconButton, Modal } from '@/components/ui';
import { IliasBadge } from '@/features/integrations';
import { formatTimeAgo } from '@/lib/date';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { cn } from '@/lib/utils';
import {
  documentRequest,
  editable,
  fileKind,
  fileSize,
  lockedReason,
  MAX_UPLOAD_BYTES,
  previewable,
  sortEntries,
  uploadDocument,
  type DirectoryListing,
  type DocumentEntry,
  type SearchHit,
} from '@/features/documents/lib/files';
import { runDocumentTool, type DocumentTool } from '@/features/documents/lib/documentTools';

type Dialog =
  | { type: 'folder' }
  | { type: 'document' }
  | { type: 'rename' | 'move' | 'trash'; entry: DocumentEntry };
type OpenNote = { entry: DocumentEntry; content: string };
type SearchResult = { query: string; hits: SearchHit[] };
type DocumentTab = { path: string; name: string; folder: boolean; entry?: DocumentEntry };
const inputClass = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-primary';
const EMPTY_ENTRIES: DocumentEntry[] = [];

interface DocumentExplorerProps {
  /**
   * A workspace folder to open at, e.g. a course's `ILIAS` folder linked from
   * Courses. It opens as a list: the canvas lays a folder out over its parents,
   * which a folder opened straight from a link has not been through.
   */
  initialPath?: string;
}

export function DocumentExplorer({ initialPath = '' }: DocumentExplorerProps) {
  const desktop = isDesktopRuntime();
  const [menu, setMenu] = useState<'add' | 'search' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState(initialPath);
  const [listing, setListing] = useState<DirectoryListing>({ root: '', entries: [] });
  const [rootEntries, setRootEntries] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(desktop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState<'list' | 'grid' | 'canvas'>(initialPath ? 'list' : 'canvas');
  const [canvasParents, setCanvasParents] = useState<Record<string, DocumentEntry[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [movePath, setMovePath] = useState('');
  const [moveFolders, setMoveFolders] = useState<DocumentEntry[]>([]);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [tabs, setTabs] = useState<DocumentTab[]>(() => [
    { path: '', name: 'Documents', folder: true },
    ...(initialPath
      ? [{ path: initialPath, name: initialPath.split('/').at(-1) ?? 'Documents', folder: true }]
      : []),
  ]);
  const [leaveRequest, setLeaveRequest] = useState(0);
  const afterLeave = useRef<(() => void) | null>(null);
  const [treeRevision, setTreeRevision] = useState(0);
  const [preview, setPreview] = useState<DocumentEntry | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const inTrash = path === '.trash' || path.startsWith('.trash/');
  const canvas = view === 'canvas' && !inTrash;
  const visible = sortEntries(listing.entries, query, sort);
  const entry = listing.entries.find((item) => item.path === selected);
  const locked = entry ? lockedReason(entry) : null;
  const searchQuery = query.trim();
  const searching = desktop && searchQuery.length >= 2;
  const searchHits = search?.query === searchQuery ? search.hits : null;

  function rememberTab(tab: DocumentTab) {
    setTabs((current) =>
      current.some((item) => item.path === tab.path)
        ? current.map((item) => (item.path === tab.path ? tab : item))
        : [...current, tab],
    );
  }

  function leaveThen(action: () => void) {
    if (!note) action();
    else {
      afterLeave.current = action;
      setLeaveRequest((current) => current + 1);
    }
  }

  function openTab(tab: DocumentTab) {
    if (tab.path === (note?.entry.path ?? path)) return;
    leaveThen(() => {
      if (tab.folder) navigate(tab.path);
      else if (tab.entry) activate(tab.entry);
    });
  }

  function closeTab(tab: DocumentTab) {
    if (!tab.path) return;
    const remove = () => {
      setTabs((current) => current.filter((item) => item.path !== tab.path));
      if (tab.path === (note?.entry.path ?? path)) navigate('');
    };
    if (tab.path === note?.entry.path) leaveThen(remove);
    else remove();
  }

  // Beyond the file names in this folder, look through every note's text.
  useEffect(() => {
    if (!searching) return;
    let active = true;
    const timer = window.setTimeout(() => {
      documentRequest<SearchHit[]>({ action: 'search', query: searchQuery })
        .then((hits) => {
          if (active) setSearch({ query: searchQuery, hits });
        })
        .catch(() => {
          if (active) setSearch({ query: searchQuery, hits: [] });
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searching]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    const id = ++generation.current;
    setLoading(true);
    try {
      const result = await documentRequest<DirectoryListing>({ action: 'list', path });
      if (id === generation.current) {
        setListing(result);
        if (!path) setRootEntries(result.entries);
        setError('');
        setTreeRevision((current) => current + 1);
      }
    } catch (cause) {
      if (id === generation.current) {
        setListing({ root: '', entries: [] });
        setError(String(cause));
      }
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [desktop, path]);

  const invalidateRequests = useCallback(() => {
    generation.current++;
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      active = false;
      invalidateRequests();
      window.removeEventListener('focus', focus);
    };
  }, [refresh, invalidateRequests]);

  useEffect(() => {
    if (dialog?.type !== 'move') return;
    let cancelled = false;
    documentRequest<DirectoryListing>({ action: 'list', path: movePath })
      .then((result) => {
        if (!cancelled)
          setMoveFolders(
            result.entries.filter(
              (item) =>
                item.folder &&
                item.path !== dialog.entry.path &&
                !item.path.startsWith(`${dialog.entry.path}/`),
            ),
          );
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, movePath]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    rememberTab({
      path: next,
      name: next === '.trash' ? 'Recently deleted' : next.split('/').at(-1) || 'Documents',
      folder: true,
    });
    if (next === path) {
      void refresh();
      return;
    }
    setMenu(null);
    setCanvasParents((previous) => ({ ...previous, [path]: listing.entries }));
    setListing({ root: listing.root, entries: [] });
    setLoading(desktop);
    setPath(next);
    setSelected(null);
    setQuery('');
    setNotice('');
    setError('');
  }
  function showDialog(next: Dialog) {
    setMenu(null);
    setName('entry' in next ? next.entry.name : next.type === 'document' ? 'Untitled.md' : '');
    setDestination('');
    setMovePath('');
    setMoveFolders([]);
    setError('');
    setDialog(next);
  }
  function activate(item: DocumentEntry) {
    if (item.folder) {
      navigate(item.path);
      return;
    }
    if (previewable(item)) {
      setPreview(item);
      return;
    }
    void run(async () => {
      if (editable(item) && !item.path.startsWith('.trash/')) {
        const content = await documentRequest<string>({ action: 'read', path: item.path });
        rememberTab({ path: item.path, name: item.name, folder: false, entry: item });
        setNote({ entry: item, content });
      } else await documentRequest({ action: 'open', path: item.path });
    });
  }
  function openHit(hit: SearchHit) {
    setMenu(null);
    if (hit.folder) navigate(hit.path);
    else activate(hit);
  }
  async function submitDialog() {
    if (!dialog) return;
    await run(async () => {
      if (dialog.type === 'folder' || dialog.type === 'document') {
        await documentRequest({
          action: 'create',
          path,
          name: name.trim(),
          folder: dialog.type === 'folder',
        });
        setNotice(`${name.trim()} created on your computer.`);
      } else if (dialog.type === 'trash') {
        await documentRequest({ action: 'trash', path: dialog.entry.path });
        setNotice('Moved to Recently deleted. You can restore it at any time.');
      } else {
        await documentRequest({
          action: 'move',
          path: dialog.entry.path,
          destination: dialog.type === 'move' ? destination : path,
          name: name.trim(),
        });
        setNotice('Changes saved on your computer.');
      }
      setDialog(null);
      setSelected(null);
      await refresh();
    });
  }
  async function importFiles(files: File[]) {
    await run(async () => {
      let imported = 0;
      const failures: string[] = [];
      for (const file of files) {
        try {
          if (file.size > MAX_UPLOAD_BYTES) throw new Error('Maximum file size is 25 MB.');
          await uploadDocument(
            { kind: 'import', path, name: file.name },
            new Uint8Array(await file.arrayBuffer()),
          );
          imported++;
        } catch (cause) {
          failures.push(`${file.name}: ${String(cause)}`);
        }
      }
      await refresh();
      setNotice(
        `${imported} ${imported === 1 ? 'file' : 'files'} imported. Originals are unchanged.`,
      );
      if (failures.length) setError(failures.join('\n'));
    });
  }
  async function executeTool(
    item: DocumentEntry,
    tool: DocumentTool,
    options?: { other?: DocumentEntry; others?: DocumentEntry[]; pages?: string },
  ): Promise<boolean> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await runDocumentTool(item, tool, options);
      await refresh();
      setSelected(`${path ? `${path}/` : ''}${result.name}`);
      setNotice(
        result.names.length === 1
          ? `${result.name} created · ${fileSize(result.after)}. Original unchanged.`
          : `${result.names.length} files created · ${fileSize(result.after)} total. Original unchanged.`,
      );
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const breadcrumbs = path ? path.split('/') : [];

  return (
    <section
      aria-label="Document explorer"
      className={cn(
        'document-explorer flex min-h-0 flex-1 flex-col overflow-hidden bg-surface',
        note && 'has-open-note',
        canvas ? 'is-canvas' : 'rounded-xl border border-line shadow-soft',
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu) {
          setMenu(null);
          event.stopPropagation();
        }
      }}
    >
      <div className="document-tabs" role="tablist" aria-label="Open documents">
        {tabs.map((tab) => {
          const active = tab.path === (note?.entry.path ?? path);
          return (
            <div key={tab.path || 'root'} className={cn('document-tab', active && 'is-active')}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.name}
                onClick={() => openTab(tab)}
              >
                {tab.folder ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
                <span>{tab.name}</span>
              </button>
              {tab.path && (
                <button
                  type="button"
                  className="document-tab-close"
                  aria-label={`Close ${tab.name} tab`}
                  onClick={() => closeTab(tab)}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="document-body">
        <DocumentTree
          desktop={desktop}
          rootEntries={rootEntries}
          activePath={path}
          activeFile={note?.entry.path ?? null}
          revision={treeRevision}
          onFolder={(next) => leaveThen(() => navigate(next))}
          onFile={(item) => leaveThen(() => activate(item))}
        />
        <div className={cn('document-content', note && 'has-open-note')}>
          {canvas && (
            <div ref={menuRef} className="canvas-floating-controls">
              <IconButton
                label="Search documents"
                aria-expanded={menu === 'search'}
                className="canvas-search-toggle canvas-floating-button"
                onClick={() => setMenu(menu === 'search' ? null : 'search')}
              >
                <Search size={16} />
                {query && <span className="canvas-search-dot" />}
              </IconButton>
              <IconButton
                label="Add to canvas"
                aria-expanded={menu === 'add'}
                className="canvas-add-toggle canvas-floating-button"
                onClick={() => setMenu(menu === 'add' ? null : 'add')}
              >
                {menu === 'add' ? <X size={19} /> : <Plus size={19} />}
              </IconButton>
              {menu === 'add' && (
                <div className="canvas-add-panel" aria-label="Add to canvas">
                  <button
                    className="canvas-menu-item"
                    disabled={!desktop || busy || loading}
                    onClick={() => showDialog({ type: 'document' })}
                  >
                    <FileText size={17} />
                    New document
                  </button>
                  <button
                    className="canvas-menu-item"
                    disabled={!desktop || busy || loading}
                    onClick={() => showDialog({ type: 'folder' })}
                  >
                    <FolderPlus size={17} />
                    New folder
                  </button>
                  <button
                    className="canvas-menu-item"
                    disabled={!desktop || busy || loading}
                    onClick={() => {
                      upload.current?.click();
                      setMenu(null);
                    }}
                  >
                    <Upload size={17} />
                    Import files
                  </button>
                  {!desktop && (
                    <p className="canvas-shortcuts">
                      Your files live on your computer. Open the desktop app to add documents.
                    </p>
                  )}
                </div>
              )}
              {menu === 'search' && (
                <div className="canvas-search-panel">
                  <Search size={15} />
                  <input
                    autoFocus
                    aria-label="Search this folder"
                    placeholder="Find a document…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <IconButton label="Clear search" size="sm" onClick={() => setQuery('')}>
                      <X size={13} />
                    </IconButton>
                  )}
                  {searching && <SearchResults query={query} hits={searchHits} onOpen={openHit} />}
                </div>
              )}
            </div>
          )}
          <input
            ref={upload}
            type="file"
            multiple
            className="hidden"
            aria-label="Import documents"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void importFiles(files);
            }}
          />
          {!canvas && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-soft text-blue">
                  <HardDrive size={20} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Your study space</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Your notes, readings, and big ideas. Together.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!desktop || busy || loading || inTrash}
                  leadingIcon={<FolderPlus size={15} />}
                  onClick={() => showDialog({ type: 'folder' })}
                >
                  New folder
                </Button>
                <Button
                  disabled={!desktop || busy || loading || inTrash}
                  leadingIcon={<Upload size={15} />}
                  onClick={() => upload.current?.click()}
                >
                  Import
                </Button>
                <Button
                  variant="primary"
                  disabled={!desktop || busy || loading || inTrash}
                  leadingIcon={<FileText size={15} />}
                  onClick={() => showDialog({ type: 'document' })}
                >
                  New document
                </Button>
              </div>
            </div>
          )}
          {!desktop && !canvas ? (
            <div className="mx-5 mt-5 flex items-start gap-3 rounded-lg border border-line bg-blue-soft p-4 text-sm">
              <Monitor className="mt-0.5 shrink-0 text-blue" size={20} />
              <div>
                <p className="font-medium">Your files live on your computer</p>
                <p className="mt-1 text-secondary">
                  Open the Uni Pilot desktop app to create folders, import files, and save documents
                  in Documents/Uni Pilot.
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside
              aria-label="Document locations"
              className={cn(
                'flex shrink-0 gap-1 border-b border-line bg-surface-secondary/60 p-3 md:w-44 md:flex-col md:border-b-0 md:border-r',
                view === 'canvas' && !inTrash && 'hidden',
              )}
            >
              <span className="mb-2 hidden px-3 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted md:block">
                On this computer
              </span>
              <button
                disabled={busy}
                onClick={() => navigate('')}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium',
                  !inTrash ? 'bg-blue-soft text-blue' : 'text-secondary hover:bg-surface-hover',
                )}
              >
                <FolderOpen size={16} />
                All documents
              </button>
              <button
                disabled={!desktop || busy}
                onClick={() => navigate('.trash')}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium',
                  inTrash ? 'bg-blue-soft text-blue' : 'text-secondary hover:bg-surface-hover',
                )}
              >
                <Trash2 size={16} />
                Recently deleted
              </button>
              <div className="mt-auto hidden px-3 pb-2 pt-10 md:block">
                <HardDrive size={17} className="mb-2 text-muted" />
                <p className="text-xs font-medium">Stored locally</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Your documents, available offline.
                </p>
              </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              {!canvas && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
                  <IconButton
                    label="Go to parent folder"
                    disabled={!path || busy || loading}
                    onClick={() => navigate(path.split('/').slice(0, -1).join('/'))}
                  >
                    <ArrowLeft size={16} />
                  </IconButton>
                  <nav
                    aria-label="Folder breadcrumbs"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs"
                  >
                    <button
                      className="rounded-sm px-1 py-1 text-secondary hover:text-primary"
                      disabled={busy}
                      onClick={() => navigate('')}
                    >
                      Documents
                    </button>
                    {breadcrumbs.map((part, index) => (
                      <span key={index} className="flex min-w-0 items-center gap-1">
                        <ChevronRight size={12} className="text-muted" />
                        <button
                          disabled={busy}
                          className="max-w-44 truncate rounded-sm px-1 py-1 font-medium"
                          onClick={() => navigate(breadcrumbs.slice(0, index + 1).join('/'))}
                        >
                          {part === '.trash' ? 'Recently deleted' : part}
                        </button>
                      </span>
                    ))}
                  </nav>
                  <IconButton
                    label="Refresh files"
                    disabled={!desktop || busy || loading}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  </IconButton>
                  <IconButton
                    label="Canvas view"
                    aria-pressed={view === 'canvas'}
                    onClick={() => setView('canvas')}
                    className={view === 'canvas' ? 'bg-surface-hover' : ''}
                  >
                    <PanelsTopLeft size={16} />
                  </IconButton>
                  <IconButton
                    label="List view"
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                    className={view === 'list' ? 'bg-surface-hover' : ''}
                  >
                    <List size={16} />
                  </IconButton>
                  <IconButton
                    label="Grid view"
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                    className={view === 'grid' ? 'bg-surface-hover' : ''}
                  >
                    <LayoutGrid size={16} />
                  </IconButton>
                </div>
              )}
              {!canvas && (
                <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <label className="flex min-w-36 flex-1 items-center gap-2 text-muted">
                    <Search size={16} />
                    <input
                      aria-label="Search this folder"
                      placeholder="Search this folder…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="w-full bg-transparent py-1 text-xs text-primary outline-none"
                    />
                  </label>
                  <select
                    aria-label="Sort documents"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    className="rounded-sm bg-surface py-1 text-xs text-secondary"
                  >
                    <option value="name">Name</option>
                    <option value="modified">Last modified</option>
                  </select>
                  {searching && !inTrash ? (
                    <SearchResults query={query} hits={searchHits} onOpen={openHit} />
                  ) : null}
                </div>
              )}
              {listing.ilias ? (
                <div
                  role="status"
                  aria-label="ILIAS sync"
                  className={cn(
                    'mx-5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-blue-soft px-3 py-2 text-xs text-primary',
                    canvas && 'canvas-message',
                  )}
                >
                  <IliasBadge size="sm" />
                  <span>
                    Kept in sync with ILIAS ·{' '}
                    <strong className="font-semibold">{listing.ilias.courseTitle}</strong>
                  </span>
                  <span className="text-muted">
                    {listing.ilias.syncedAt
                      ? `Last synced ${formatTimeAgo(new Date(listing.ilias.syncedAt), new Date())}`
                      : 'Not synced yet'}
                  </span>
                  <Link
                    to={`/courses?course=${encodeURIComponent(listing.ilias.courseRefId)}`}
                    className="ml-auto font-medium text-blue hover:underline"
                  >
                    Open course
                  </Link>
                </div>
              ) : null}
              {error && !dialog && !note ? (
                <p
                  role="alert"
                  className={cn(
                    'mx-5 mb-3 whitespace-pre-line rounded-md border border-line p-3 text-xs text-danger',
                    canvas && 'canvas-message bg-surface',
                  )}
                >
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p
                  role="status"
                  className={cn(
                    'mx-5 mb-3 text-xs text-green',
                    canvas && 'canvas-message bg-surface',
                  )}
                >
                  {notice}
                </p>
              ) : null}
              {inTrash ? (
                <p className="mx-5 mb-3 text-xs text-secondary">
                  Items stay here until restored. This is Uni Pilot’s recovery folder, separate from
                  the system Trash.
                </p>
              ) : null}
              {view === 'canvas' && !inTrash ? (
                <DocumentCanvas
                  options={
                    <>
                      <button className="canvas-menu-item" onClick={() => setView('list')}>
                        <List size={15} />
                        List view
                      </button>
                      <button className="canvas-menu-item" onClick={() => setView('grid')}>
                        <LayoutGrid size={15} />
                        Grid view
                      </button>
                      <button
                        className="canvas-menu-item"
                        disabled={!desktop || busy || loading}
                        onClick={() => void refresh()}
                      >
                        <RefreshCw size={15} />
                        Refresh files
                      </button>
                      <button
                        className="canvas-menu-item"
                        disabled={!desktop || busy}
                        onClick={() => navigate('.trash')}
                      >
                        <Trash2 size={15} />
                        Recently deleted
                      </button>
                    </>
                  }
                  entries={visible}
                  allEntries={listing.entries}
                  background={
                    canvasParents[path.split('/').slice(0, -1).join('/')] ?? EMPTY_ENTRIES
                  }
                  path={path}
                  selected={selected}
                  disabled={busy || loading}
                  loading={loading}
                  canEdit={desktop}
                  query={query}
                  onSelect={setSelected}
                  onOpen={activate}
                  onBack={() => navigate(path.split('/').slice(0, -1).join('/'))}
                  onCreate={() => showDialog({ type: 'document' })}
                  onImport={(files) => void importFiles(files)}
                  onMove={async (item, target) => {
                    const reason = lockedReason(item);
                    if (reason) {
                      setError(reason);
                      return false;
                    }
                    let moved = false;
                    await run(async () => {
                      await documentRequest({
                        action: 'move',
                        path: item.path,
                        destination: target,
                        name: item.name,
                      });
                      moved = true;
                      setSelected(null);
                      setNotice(
                        `${item.name} moved into ${target ? target.split('/').at(-1) : 'Documents'}.`,
                      );
                      await refresh();
                    });
                    return moved;
                  }}
                />
              ) : (
                <div
                  className="scroll-area min-h-56 flex-1 overflow-auto px-3 pb-3"
                  aria-busy={loading || busy}
                >
                  {loading ? (
                    <p role="status" className="p-10 text-center text-sm text-muted">
                      Loading your files…
                    </p>
                  ) : visible.length ? (
                    <div
                      aria-label="Files"
                      className={
                        view === 'grid'
                          ? 'grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4'
                          : 'flex flex-col gap-0.5'
                      }
                    >
                      {view === 'list' ? (
                        <div
                          aria-hidden
                          className="flex gap-3 border-b border-line-soft px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted"
                        >
                          <span className="flex-1">Name</span>
                          <span className="hidden w-24 md:block">Modified</span>
                          <span className="w-16 text-right">Size</span>
                        </div>
                      ) : null}
                      {visible.map((item) => {
                        const Icon = item.folder ? Folder : editable(item) ? FileText : File;
                        return (
                          <button
                            key={item.path}
                            aria-label={`Select ${item.name}`}
                            aria-pressed={selected === item.path}
                            disabled={busy}
                            onClick={() => setSelected(item.path)}
                            onDoubleClick={() => activate(item)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                activate(item);
                              }
                            }}
                            className={cn(
                              'group rounded-md border text-left transition-colors',
                              view === 'grid'
                                ? 'flex min-h-32 flex-col items-center justify-center gap-2 p-4 text-center'
                                : 'flex items-center gap-3 px-3 py-3',
                              selected === item.path
                                ? 'border-blue/20 bg-blue-soft'
                                : 'border-transparent hover:bg-surface-secondary',
                            )}
                          >
                            <Icon
                              aria-hidden
                              size={view === 'grid' ? 40 : 23}
                              strokeWidth={1.4}
                              className={cn(
                                'shrink-0',
                                item.folder ? 'fill-blue/10 text-blue' : 'text-muted',
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium">
                                <span className="truncate">{item.name}</span>
                                {item.ilias === 'root' ? (
                                  <IliasBadge size="sm" />
                                ) : item.ilias === 'file' ||
                                  item.ilias === 'folder' ||
                                  item.ilias === 'gone' ? (
                                  <IliasBadge
                                    size="sm"
                                    showLabel={false}
                                    title="Downloaded from ILIAS"
                                  />
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-muted">
                                {item.ilias === 'gone' ? 'No longer on ILIAS' : fileKind(item)}
                              </span>
                            </span>
                            {view === 'list' ? (
                              <>
                                <span className="hidden w-24 shrink-0 text-[11px] text-muted md:block">
                                  {item.modified
                                    ? new Date(item.modified).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : '—'}
                                </span>
                                <span className="w-16 shrink-0 text-right text-[11px] text-muted">
                                  {item.folder ? '—' : fileSize(item.size)}
                                </span>
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                      <FolderOpen size={42} strokeWidth={1.2} className="text-blue" />
                      <h3 className="mt-4 text-sm font-semibold">
                        {query
                          ? 'No matching documents'
                          : inTrash
                            ? 'Nothing in Recently deleted'
                            : 'Room for your next idea'}
                      </h3>
                      <p className="mt-2 max-w-64 text-xs leading-relaxed text-muted">
                        {query
                          ? 'Try another name or clear your search.'
                          : inTrash
                            ? 'Documents you remove will appear here.'
                            : 'Create a folder for a course, bring in lecture slides, or start a fresh note.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {entry ? (
                <div
                  aria-label="Selected file actions"
                  className={cn(
                    'flex flex-wrap items-center gap-1 px-4 py-2',
                    canvas ? 'canvas-selection-toolbar' : 'border-t border-line',
                  )}
                >
                  <span className="mr-auto max-w-40 truncate pr-3 text-xs font-medium">
                    {entry.name}
                  </span>
                  {locked ? (
                    <span className="max-w-52 text-[10px] text-muted">{locked}</span>
                  ) : null}
                  <Button size="sm" disabled={busy || loading} onClick={() => activate(entry)}>
                    Open
                  </Button>
                  {!inTrash && (
                    <FileTools
                      key={entry.path}
                      entry={entry}
                      siblings={listing.entries}
                      disabled={busy || loading || !desktop}
                      onExecute={(tool, options) => executeTool(entry, tool, options)}
                    />
                  )}
                  {inTrash ? (
                    <Button
                      size="sm"
                      disabled={busy || loading}
                      onClick={() => showDialog({ type: 'move', entry })}
                    >
                      Restore…
                    </Button>
                  ) : (
                    <>
                      <IconButton
                        label="Rename selected item"
                        {...(locked ? { title: locked } : {})}
                        disabled={busy || loading || !!locked}
                        onClick={() => showDialog({ type: 'rename', entry })}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <Button
                        size="sm"
                        title={locked ?? undefined}
                        disabled={busy || loading || !!locked}
                        onClick={() => showDialog({ type: 'move', entry })}
                      >
                        Move
                      </Button>
                      <IconButton
                        label="Move to Recently deleted"
                        {...(locked ? { title: locked } : {})}
                        disabled={busy || loading || !!locked}
                        onClick={() => showDialog({ type: 'trash', entry })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || loading}
                    onClick={() =>
                      void run(async () => {
                        await documentRequest({ action: 'reveal', path: entry.path });
                      })
                    }
                  >
                    Show in file manager
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          {!canvas && (
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-secondary/50 px-5 py-2.5 text-[10px] text-muted">
              <span>
                {visible.length} {visible.length === 1 ? 'item' : 'items'}
                {busy ? ' · Saving changes…' : ' · Double-click or press Enter to open'}
              </span>
              <button
                title={listing.root || 'Documents/Uni Pilot'}
                disabled={!desktop || busy}
                onClick={() =>
                  void run(async () => {
                    await documentRequest({ action: 'open', path });
                  })
                }
                className="flex items-center gap-1.5 hover:text-primary"
              >
                <HardDrive size={12} />
                {listing.root || 'Documents/Uni Pilot'}
              </button>
            </footer>
          )}
          {preview && <DocumentPreview entry={preview} onClose={() => setPreview(null)} />}
          <Modal
            open={!!dialog}
            onClose={() => {
              if (!busy) setDialog(null);
            }}
            title={
              dialog?.type === 'folder'
                ? 'New folder'
                : dialog?.type === 'document'
                  ? 'New document'
                  : dialog?.type === 'rename'
                    ? 'Rename item'
                    : dialog?.type === 'move'
                      ? inTrash
                        ? 'Restore item'
                        : 'Move item'
                      : 'Move to Recently deleted?'
            }
            footer={
              <>
                <Button disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form="document-action"
                  disabled={busy || (dialog?.type !== 'trash' && !name.trim())}
                >
                  {busy
                    ? 'Saving…'
                    : dialog?.type === 'trash'
                      ? 'Move to Recently deleted'
                      : dialog?.type === 'move'
                        ? inTrash
                          ? 'Restore here'
                          : 'Move here'
                        : 'Save'}
                </Button>
              </>
            }
          >
            <form
              id="document-action"
              onSubmit={(event) => {
                event.preventDefault();
                void submitDialog();
              }}
              className="space-y-4"
            >
              {dialog?.type === 'trash' ? (
                <p className="text-sm text-secondary">
                  “{dialog.entry.name}”{dialog.entry.folder ? ' and everything inside it' : ''} will
                  move to Uni Pilot’s recovery folder. You can restore it later.
                </p>
              ) : (
                <label className="block text-xs font-medium">
                  Name
                  <input
                    required
                    className={`${inputClass} mt-2`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                  {dialog?.type === 'document' ? (
                    <span className="mt-2 block font-normal text-muted">
                      Use .md for Markdown or .txt for plain text.
                    </span>
                  ) : null}
                </label>
              )}
              {dialog?.type === 'move' ? (
                <div className="rounded-md border border-line p-3">
                  <p className="mb-2 text-xs text-secondary">
                    Destination: Documents{destination ? ` / ${destination}` : ''}
                  </p>
                  <Button
                    size="sm"
                    disabled={busy || !movePath}
                    onClick={() => {
                      const parent = movePath.split('/').slice(0, -1).join('/');
                      setMovePath(parent);
                      setDestination(parent);
                    }}
                  >
                    Parent folder
                  </Button>
                  <div className="mt-2 max-h-48 overflow-auto">
                    {moveFolders.map((folder) => (
                      <button
                        type="button"
                        key={folder.path}
                        disabled={busy}
                        className="flex w-full items-center gap-2 rounded-sm p-2 text-left text-xs hover:bg-surface-hover"
                        onClick={() => {
                          setMoveFolders([]);
                          setMovePath(folder.path);
                          setDestination(folder.path);
                        }}
                      >
                        <Folder size={15} className="text-blue" />
                        {folder.name}
                        <ChevronRight size={12} className="ml-auto" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </form>
          </Modal>
          {note ? (
            <StudyEditor
              key={note.entry.path}
              entry={note.entry}
              initialContent={note.content}
              leaveRequest={leaveRequest}
              onClose={() => {
                setNote(null);
                void refresh();
                const next = afterLeave.current;
                afterLeave.current = null;
                next?.();
              }}
              onRenamed={(entry, content) => {
                setTabs((current) =>
                  current.map((tab) =>
                    tab.path === note.entry.path
                      ? { path: entry.path, name: entry.name, folder: false, entry }
                      : tab,
                  ),
                );
                setNote({ entry, content });
                void refresh();
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
