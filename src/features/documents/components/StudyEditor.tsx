import { EditablePdfPage, EditableStudyPage } from '@/features/documents/components/StudyPage';
import { StudyAnnotationToolbar } from '@/features/documents/components/StudyAnnotationToolbar';
import { StudyDocumentControls } from '@/features/documents/components/StudyDocumentControls';
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Focus } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { ChevronLeft, FileWarning, NotebookPen, PanelLeft, PenLine, X } from 'lucide-react';
import { Button, IconButton, Modal } from '@/components/ui';
import { attachmentName, isImageFile } from '@/features/documents/lib/attachments';
import {
  createAutosaver,
  type Autosaver,
  type AutosaveState,
  type SaveOutcome,
} from '@/features/documents/lib/autosave';
import {
  documentRequest,
  MAX_UPLOAD_BYTES,
  uploadDocument,
  type DirectoryListing,
  type DocumentEntry,
} from '@/features/documents/lib/files';
import {
  composeNote,
  findContentLoss,
  noteExtensions,
  splitFrontMatter,
} from '@/features/documents/lib/markdown';
import { countWords, noteStats, readingMinutes } from '@/features/documents/lib/noteOutline';
import { NoteBlockKeys } from '@/features/documents/lib/blockActions';
import { NoteSearch } from '@/features/documents/lib/noteSearch';
import { NotePageBreaks, setPageBreaks } from '@/features/documents/lib/pageBreaks';
import { noteTitle, titleToFileName } from '@/features/documents/lib/noteTitle';
import { sheetStackStyle, stackHeight, stepZoom } from '@/features/documents/lib/pageSheets';
import { setTextMarker, TextMarker } from '@/features/documents/lib/textMarker';
import {
  registerImagePicker,
  SlashCommandExtension,
  type SlashMenuState,
} from '@/features/documents/lib/slashCommand';
import { NoteTypography } from '@/features/documents/lib/typography';
import { usePageSheets } from '@/features/documents/lib/usePageSheets';
import { usePageZoom } from '@/features/documents/lib/usePageZoom';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { cn } from '@/lib/utils';
import { BlockHandle } from './BlockHandle';
import { DrawingBoard, type DrawingHandle } from './DrawingBoard';
import { EditorDock } from './EditorDock';
import { NoteImage } from './NoteImage';
import { EditableNoteCodeBlock } from './NoteCodeBlock';
import { EditableNoteBlockMath, EditableNoteInlineMath } from './NoteMath';
import { NoteSidebar } from './NoteSidebar';
import { NoteToolbar } from './NoteToolbar';
import { EditableNoteCard, EditableNoteLayout } from './NoteVisual';
import { NoteTitle } from './NoteTitle';
import { NotebookView } from './NotebookView';
import { PageSheets } from './PageSheets';
import { PageZoom } from './PageZoom';
import { SaveStatus } from './SaveStatus';
import { SelectionMenu } from './SelectionMenu';
import { SlashMenu } from './SlashMenu';

type StudyEditorProps = {
  entry: DocumentEntry;
  /** The file's text as read from disk. */
  initialContent: string;
  leaveRequest?: number;
  onClose: () => void;
  /** The note now lives at `entry`; it is reopened there with `content`. */
  onRenamed: (entry: DocumentEntry, content: string) => void;
};

type Notice = { tone: 'error' | 'info'; text: string };
type Mode = 'text' | 'drawing';

function imageFiles(transfer: DataTransfer | null): File[] {
  const files = Array.from(transfer?.files ?? []);
  const candidates = files.length
    ? files
    : Array.from(transfer?.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
  return candidates.filter(isImageFile);
}

/**
 * Copies images into the note's `attachments` folder and links them where
 * they were pasted or dropped. Inlining them as base64 would bloat the note
 * past the 2 MB editor limit with a single screenshot.
 */
async function insertImages(
  view: EditorView,
  files: File[],
  notePath: string,
  report: (notice: Notice) => void,
  position?: number,
) {
  let at = position;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      report({ tone: 'error', text: `“${file.name}” is larger than 25 MB and was not added.` });
      continue;
    }
    try {
      const { src } = await uploadDocument<{ src: string }>(
        { kind: 'attachment', note: notePath, name: attachmentName(file) },
        new Uint8Array(await file.arrayBuffer()),
      );
      if (view.isDestroyed) return;
      const image = view.state.schema.nodes.image?.create({
        src,
        alt: file.name.replace(/\.[^.]+$/, ''),
      });
      if (!image) return;
      const { state } = view;
      const transaction =
        at === undefined
          ? state.tr
          : state.tr.setSelection(
              TextSelection.near(state.doc.resolve(Math.min(at, state.doc.content.size))),
            );
      view.dispatch(transaction.replaceSelectionWith(image).scrollIntoView());
      // Further images follow the one just placed.
      at = undefined;
    } catch (cause) {
      report({ tone: 'error', text: `“${file.name}” could not be added. ${String(cause)}` });
    }
  }
}

function plainStats(text: string) {
  const words = countWords(text);
  return {
    words,
    characters: text.replace(/\s/g, '').length,
    headings: 0,
    images: 0,
    tasks: 0,
    openTasks: 0,
    readingMinutes: readingMinutes(words),
  };
}

export function StudyEditor({
  entry,
  initialContent,
  leaveRequest = 0,
  onClose,
  onRenamed,
}: StudyEditorProps) {
  const path = entry.path;
  const id = useId();
  // jsdom has no layout, so its tests edit through the plain text surface.
  const layoutlessDom =
    typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function';
  // Plain text is written back exactly as typed, never through Markdown.
  const plain = layoutlessDom || /\.txt$/i.test(entry.name);
  const initial = useMemo(() => splitFrontMatter(initialContent), [initialContent]);
  const [mode, setMode] = useState<Mode>('text');
  const settings = useNoteStyleStore();
  const study = /^:{3,}(?:pdfPage|studyPage)(?:[ \t]+[^\r\n]+)?\r?$/m.test(initial.body);
  const notebook = settings.style === 'notebook' && !study;
  const [drawingOpened, setDrawingOpened] = useState(false);
  const [status, setStatus] = useState<AutosaveState>({ kind: 'saved' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // The conflict the user set aside; a later, different conflict opens again.
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const [closing, setClosing] = useState<'idle' | 'saving' | 'blocked'>('idle');
  const [plainText, setPlainText] = useState(initialContent);
  const [slash, setSlash] = useState<SlashMenuState | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  // The page's scroll container: the sidebar follows it and the menus reposition with it.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  // The sheet stack and the text layer that flows across its sheets.
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [flow, setFlow] = useState<HTMLDivElement | null>(null);
  const plainTextRef = useRef(initialContent);
  const plainField = useRef<HTMLTextAreaElement>(null);
  const frontMatter = useRef(initial.frontMatter);
  const autosaver = useRef<Autosaver | null>(null);
  const drawing = useRef<DrawingHandle>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const extensions = useMemo(
    () => [
      ...noteExtensions({
        image: NoteImage.configure({ allowBase64: true, notePath: path }),
        placeholder: 'Write, or type / for blocks…',
        pdfPage: EditablePdfPage.configure({ notePath: path }),
        studyPage: EditableStudyPage,
        card: EditableNoteCard,
        layout: EditableNoteLayout,
        codeBlock: EditableNoteCodeBlock,
        inlineMath: EditableNoteInlineMath,
        blockMath: EditableNoteBlockMath,
      }),
      // Decorations only: none of these add anything that could reach the file.
      Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
      NoteSearch,
      NotePageBreaks,
      TextMarker,
      SlashCommandExtension.configure({ onChange: setSlash }),
      // Typing and keyboard help: they change the note only as the student asks.
      NoteTypography,
      NoteBlockKeys,
    ],
    [path],
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: plain ? '' : initial.body,
    contentType: 'markdown',
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Document content', 'aria-multiline': 'true' },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData);
        if (!files.length || !view.editable) return false;
        void insertImages(view, files, path, setNotice);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = moved || !view.editable ? [] : imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(view, files, path, setNotice, position);
        return true;
      },
    },
    onUpdate: () => autosaver.current?.change(),
    onBlur: () => void autosaver.current?.flush(),
  });
  const source = plain ? null : editor;

  // Opening must never be the reason a note loses content: if saving would
  // drop text the editor cannot represent (HTML, comments), it opens read-only.
  const lost = useMemo(
    () => (source ? findContentLoss(initial.body, source.getMarkdown()) : []),
    [initial.body, source],
  );
  const readOnly = lost.length > 0 && !unlocked;

  useEffect(() => {
    if (source && !source.isDestroyed)
      setTextMarker(source.view, { enabled: settings.markers, only: settings.markerOnly });
  }, [settings.markers, settings.markerOnly, source]);

  useEffect(() => {
    // While a rename is on its way, typing would be saved under the old name.
    source?.setEditable(!readOnly && !renaming, false);
  }, [readOnly, renaming, source]);

  // The / menu's Image command opens the same picker as pasting would use.
  useEffect(() => {
    if (!source) return;
    return registerImagePicker(source, () => imageInput.current?.click());
  }, [source]);

  useEffect(() => {
    if (!source?.isEditable) return;
    // A notebook opens where its ribbon lies, or on the first page.
    const current = useNoteStyleStore.getState();
    source.commands.focus(
      !study && current.style === 'notebook' ? (current.bookmarks[path] ?? 'start') : 'start',
      // An atomic PDF selection must not scroll its caption behind the toolbar on opening.
      { scrollIntoView: !study },
    );
  }, [path, source, study]);

  useEffect(() => {
    if (!plain && !source) return;
    const read = () =>
      source ? composeNote(frontMatter.current, source.getMarkdown()) : plainTextRef.current;
    const saver = createAutosaver({
      disk: initialContent,
      baseline: read(),
      read,
      write: (content, expected) =>
        documentRequest<SaveOutcome>({ action: 'save', path, content, expected }),
      onState: setStatus,
    });
    autosaver.current = saver;
    const flush = () => void saver.flush();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      // Closing the note or leaving the page: the last edits are still written.
      flush();
      saver.dispose();
      autosaver.current = null;
    };
  }, [initialContent, path, plain, source]);

  useEffect(() => {
    if (notice?.tone !== 'info') return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Plain text grows with its content, so the page scrolls as one sheet.
  useLayoutEffect(() => {
    const field = plainField.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [plainText, notebook]);

  function currentText() {
    return source ? composeNote(frontMatter.current, source.getMarkdown()) : plainTextRef.current;
  }

  /** Replaces the editor's content with the disk version and treats it as saved. */
  function adopt(disk: string) {
    const saver = autosaver.current;
    if (!saver) return;
    const next = splitFrontMatter(disk);
    frontMatter.current = next.frontMatter;
    if (source) {
      source.commands.setContent(next.body, { contentType: 'markdown', emitUpdate: false });
      saver.reset(disk, composeNote(next.frontMatter, source.getMarkdown()));
    } else {
      plainTextRef.current = disk;
      setPlainText(disk);
      saver.reset(disk, disk);
    }
  }

  // Like other editors, pick up changes another app made to a note that has no
  // unsaved edits here; with edits, the next save reports a conflict instead.
  const adoptExternalChange = useEffectEvent(async () => {
    const saver = autosaver.current;
    if (!saver?.clean) return;
    const disk = await documentRequest<string>({ action: 'read', path }).catch(() => null);
    if (disk === null || disk === saver.disk || autosaver.current !== saver || !saver.clean) return;
    adopt(disk);
    setNotice({ tone: 'info', text: 'Updated with changes saved in another app.' });
  });

  useEffect(() => {
    const onFocus = () => void adoptExternalChange();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  async function flushAll() {
    await Promise.all([autosaver.current?.flush(), drawing.current?.flush()]);
    return (autosaver.current?.clean ?? true) && (drawing.current?.clean ?? true);
  }

  async function close() {
    setClosing('saving');
    if (await flushAll()) onClose();
    else setClosing('blocked');
  }

  const lastLeaveRequest = useRef(leaveRequest);
  const closeForTab = useEffectEvent(() => {
    void close();
  });
  useEffect(() => {
    if (leaveRequest !== lastLeaveRequest.current) {
      lastLeaveRequest.current = leaveRequest;
      closeForTab();
    }
  }, [leaveRequest]);

  async function keepBoth(disk: string) {
    try {
      const mine = currentText();
      const folder = path.split('/').slice(0, -1).join('/');
      const extension = /\.[^.]+$/.exec(entry.name)?.[0] ?? '';
      const base = entry.name.slice(0, entry.name.length - extension.length);
      const listing = await documentRequest<DirectoryListing>({ action: 'list', path: folder });
      const taken = new Set(listing.entries.map((item) => item.name));
      let name = `${base} (my version)${extension}`;
      for (let copy = 2; taken.has(name); copy += 1)
        name = `${base} (my version ${copy})${extension}`;
      await documentRequest({ action: 'create', path: folder, name, folder: false });
      await documentRequest<SaveOutcome>({
        action: 'save',
        path: folder ? `${folder}/${name}` : name,
        content: mine,
        expected: '',
      });
      adopt(disk);
      setNotice({ tone: 'info', text: `Your version was saved as “${name}”.` });
    } catch (cause) {
      setNotice({
        tone: 'error',
        text: `Your version could not be saved as a copy. ${String(cause)}`,
      });
    }
  }

  /**
   * Renames the note after the title on its page. Everything is saved first,
   * and the note reopens from disk under its new name, so autosave compares
   * against the file that is really there.
   */
  async function rename(nextTitle: string): Promise<boolean> {
    const check = titleToFileName(nextTitle, entry.name);
    if (!check.ok) {
      setNotice({ tone: 'error', text: check.reason });
      return false;
    }
    if (check.fileName === entry.name) return false;
    setRenaming(true);
    try {
      if (!(await flushAll())) throw new Error('Your latest changes could not be saved first.');
      const folder = path.split('/').slice(0, -1).join('/');
      await documentRequest({ action: 'move', path, destination: folder, name: check.fileName });
      const nextPath = folder ? `${folder}/${check.fileName}` : check.fileName;
      useNoteStyleStore.getState().moveBookmark(path, nextPath);
      useSidebarStore.getState().relocateFavorites(path, nextPath);
      const content = await documentRequest<string>({ action: 'read', path: nextPath }).catch(() =>
        currentText(),
      );
      onRenamed({ ...entry, name: check.fileName, path: nextPath }, content);
      return true;
    } catch (cause) {
      setNotice({
        tone: 'error',
        text: `“${entry.name}” could not be renamed. ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      setRenaming(false);
      return false;
    }
  }

  function continueFromTitle() {
    if (source) source.commands.focus('start');
    else {
      plainField.current?.focus();
      plainField.current?.setSelectionRange(0, 0);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 's') {
      event.preventDefault();
      void flushAll();
    } else if (mod && !event.altKey && paged && ['=', '+', '-', '0'].includes(event.key)) {
      // Zoom the sheets, not the window: ⌘+ / ⌘− step, ⌘0 is actual size.
      event.preventDefault();
      zoomTo(event.key === '0' ? 1 : stepZoom(zoom, event.key === '-' ? -1 : 1));
    } else if (mod && event.shiftKey && key === 'f') {
      event.preventDefault();
      settings.toggleFocus();
    } else if (mod && event.shiftKey && key === 'm') {
      event.preventDefault();
      settings.toggleMarkers();
    } else if (mod && !event.shiftKey && key === 'f' && source && !notebook && mode === 'text') {
      event.preventDefault();
      if (!settings.sidebar) settings.toggleSidebar();
      setSearchRequest((count) => count + 1);
    } else if (event.altKey && event.key === 'F10') {
      // The WAI-ARIA shortcut from text to its formatting toolbar.
      const tool =
        document.querySelector<HTMLElement>('.note-bubble [role="toolbar"] [tabindex="0"]') ??
        document.querySelector<HTMLElement>('.editor-dock [data-panel="text"]');
      if (tool) {
        event.preventDefault();
        tool.focus();
      }
    }
  }

  function selectMode(next: Mode) {
    setMode(next);
    if (next === 'drawing') setDrawingOpened(true);
  }

  const title = noteTitle(entry.name);
  const folders = path.split('/').slice(0, -1);
  const conflict = status.kind === 'conflict' ? status.disk : null;
  const onPage = mode === 'text' && !notebook;
  const showSidebar = Boolean(source) && onPage && settings.sidebar;
  // A text file is one textarea, which cannot break across sheets.
  const layout =
    study || (settings.layout === 'pages' && /\.txt$/i.test(entry.name)) ? 'card' : settings.layout;
  const paged = onPage && layout === 'pages';
  const sheets = usePageSheets(page, flow, paged);
  const { zoom, zoomTo } = usePageZoom(stage, paged);
  const breaks = sheets ? sheets.count - 1 : 0;
  // Before the paint, so a new sheet never shows without its boundary.
  useLayoutEffect(() => {
    if (source && !source.isDestroyed) setPageBreaks(source.view, breaks);
  }, [breaks, source]);

  /** Like a word processor: a click on the empty rest of the page writes at the end. */
  function writeAtEnd(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const body = flow?.lastElementChild;
    if (!sheets || !source?.isEditable || !body || target.closest('.note-page-flow > *')) return;
    if (event.clientY < body.getBoundingClientRect().bottom) return;
    event.preventDefault();
    source.commands.focus('end');
  }
  const plainEditor = (
    <textarea
      ref={plainField}
      aria-label="Document content"
      className="study-editor-plain"
      value={plainText}
      spellCheck
      disabled={renaming}
      onChange={(event) => {
        plainTextRef.current = event.target.value;
        setPlainText(event.target.value);
        autosaver.current?.change();
      }}
      onBlur={() => void autosaver.current?.flush()}
    />
  );

  return (
    <section
      className={cn('note-workspace', settings.focus && 'is-focus', study && 'has-study-pages')}
      aria-label={`Edit ${entry.name}`}
      data-font={settings.font}
      data-text-size={settings.textSize}
      data-line-spacing={settings.lineSpacing}
      data-width={settings.width}
      data-backdrop={settings.backdrop}
      data-layout={layout}
      data-tone={settings.tone}
      data-cover={settings.cover}
      data-bold-color={settings.boldColor}
      onKeyDown={onKeyDown}
    >
      <header className="note-topbar">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Back to board"
          title="Back to board"
          disabled={closing === 'saving'}
          onClick={() => void close()}
          leadingIcon={<ChevronLeft size={16} />}
        >
          Board
        </Button>
        {source && onPage ? (
          <IconButton
            label={settings.sidebar ? 'Hide note overview' : 'Show note overview'}
            size="sm"
            aria-pressed={settings.sidebar}
            onClick={settings.toggleSidebar}
          >
            <PanelLeft size={16} />
          </IconButton>
        ) : null}
        <nav aria-label="Location" className="note-crumbs">
          {folders.map((folder, index) => (
            <span key={`${index}-${folder}`} className="note-crumb">
              {folder}
            </span>
          ))}
          {/* Imported sheets keep their heading here so the first page starts below the tools. */}
          {onPage && !study ? (
            <span className="note-crumb is-current" aria-current="page">
              {title}
            </span>
          ) : (
            <h1 className="note-crumb is-current">{title}</h1>
          )}
        </nav>
        {sheets ? <PageZoom stage={stage} layout={sheets} zoom={zoom} onZoom={zoomTo} /> : null}
        {source && study ? (
          <StudyDocumentControls
            editor={source}
            entry={entry}
            readContent={currentText}
            flush={flushAll}
            report={setNotice}
          />
        ) : null}
        <SaveStatus
          state={status}
          savedLabel="Saved on your computer"
          onRetry={() => void autosaver.current?.flush()}
          onResolve={() => setDismissedConflict(null)}
        />
        <div
          role="tablist"
          aria-label="Workspace"
          className="study-editor-modes"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = mode === 'text' ? 'drawing' : 'text';
            selectMode(next);
            document.getElementById(`${id}-${next}-tab`)?.focus();
          }}
        >
          {(['text', 'drawing'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${id}-${tab}-tab`}
              aria-selected={mode === tab}
              aria-controls={`${id}-${tab}`}
              tabIndex={mode === tab ? 0 : -1}
              onClick={() => selectMode(tab)}
            >
              {tab === 'text' ? <NotebookPen size={14} /> : <PenLine size={14} />}
              {tab === 'text' ? 'Notes' : 'Canvas'}
            </button>
          ))}
        </div>
      </header>

      {closing === 'blocked' ? (
        <div role="alert" className="note-banner is-problem">
          <span>
            Your latest changes are not saved yet
            {status.kind === 'error' ? `: ${status.message}` : '.'}
          </span>
          <Button size="sm" onClick={() => void close()}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close without saving
          </Button>
        </div>
      ) : null}
      {readOnly ? (
        <div role="alert" className="note-banner">
          <FileWarning size={16} aria-hidden />
          <span>
            <strong>Opened read-only to protect this note.</strong> It contains formatting the
            editor can’t keep, such as HTML or comments; saving here would remove it.
          </span>
          <Button size="sm" onClick={() => setUnlocked(true)}>
            Edit anyway
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void documentRequest({ action: 'open', path }).catch((cause: unknown) =>
                setNotice({ tone: 'error', text: String(cause) }),
              )
            }
          >
            Open in default app
          </Button>
        </div>
      ) : null}
      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn('note-banner', notice.tone === 'error' && 'is-problem')}
        >
          <span>{notice.text}</span>
          <IconButton label="Dismiss" size="sm" onClick={() => setNotice(null)}>
            <X size={14} />
          </IconButton>
        </div>
      ) : null}

      <div className={cn('study-editor', notebook && mode === 'text' && 'is-notebook')}>
        <div
          role="tabpanel"
          id={`${id}-text`}
          aria-labelledby={`${id}-text-tab`}
          hidden={mode !== 'text'}
          className="study-editor-panel"
        >
          {source && notebook ? (
            <NoteToolbar
              editor={source}
              disabled={readOnly || renaming}
              onOpenCanvas={() => selectMode('drawing')}
            />
          ) : null}
          {source && study ? <StudyAnnotationToolbar editor={source} report={setNotice} /> : null}
          <div className="note-shell">
            {showSidebar && source ? (
              <NoteSidebar editor={source} scrollRoot={stage} searchRequest={searchRequest} />
            ) : null}
            {/* The dock floats over the page or the notebook, centred on it, not on the sidebar. */}
            <div className="note-frame">
              {notebook ? (
                plain ? (
                  <NotebookView title={title} notePath={path} editor={null} flow={false}>
                    {plainEditor}
                  </NotebookView>
                ) : source ? (
                  <NotebookView title={title} notePath={path} editor={source} flow>
                    <EditorContent editor={source} />
                  </NotebookView>
                ) : (
                  <div className="study-editor-loading">Opening your note…</div>
                )
              ) : (
                <div ref={setStage} className="note-stage">
                  {/* Takes the zoomed size of the sheets, which are scaled inside it. */}
                  <div
                    className="note-zoom"
                    style={
                      paged
                        ? ({
                            '--note-zoom': zoom,
                            height: sheets ? stackHeight(sheets) * zoom : undefined,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    <article
                      ref={setPage}
                      className="note-page"
                      aria-label="Page"
                      style={sheets ? sheetStackStyle(sheets) : undefined}
                      onMouseDown={writeAtEnd}
                    >
                      {sheets ? <PageSheets layout={sheets} /> : null}
                      {/* Outside the text layer, whose clip hides the margins it sits in. */}
                      {source ? <BlockHandle editor={source} container={page} /> : null}
                      <div ref={setFlow} className="note-page-flow">
                        {!study ? (
                          <>
                            {settings.cover !== 'none' ? (
                              <div
                                className={cn('note-page-cover', `is-${settings.cover}`)}
                                aria-hidden="true"
                              >
                                <span />
                                <span />
                                <span />
                              </div>
                            ) : null}
                            <div className="note-page-eyebrow">
                              <NotebookPen size={14} aria-hidden />
                              <span>{folders.at(-1) || 'Personal notes'}</span>
                            </div>
                            <NoteTitle
                              title={title}
                              fileName={entry.name}
                              disabled={renaming}
                              onRename={rename}
                              onContinue={continueFromTitle}
                            />
                          </>
                        ) : null}
                        {plain ? (
                          plainEditor
                        ) : source ? (
                          <EditorContent editor={source} className="note-page-body" />
                        ) : (
                          <div className="study-editor-loading">Opening your note…</div>
                        )}
                      </div>
                    </article>
                  </div>
                </div>
              )}
              {!study ? (
                <EditorDock
                  editor={source}
                  disabled={readOnly || renaming}
                  onInsertImage={() => imageInput.current?.click()}
                  onOpenCanvas={() => selectMode('drawing')}
                  readStats={() => (source ? noteStats(source.state.doc) : plainStats(plainText))}
                  fileName={entry.name}
                  keepsProperties={Boolean(initial.frontMatter)}
                />
              ) : null}
            </div>
          </div>
          {source ? (
            <>
              <SelectionMenu editor={source} scrollTarget={stage} />
              {slash ? <SlashMenu editor={source} menu={slash} /> : null}
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).filter(isImageFile);
                  event.target.value = '';
                  if (files.length) void insertImages(source.view, files, path, setNotice);
                }}
              />
            </>
          ) : null}
        </div>
        {drawingOpened ? (
          <div
            role="tabpanel"
            id={`${id}-drawing`}
            aria-labelledby={`${id}-drawing-tab`}
            hidden={mode !== 'drawing'}
            className="study-editor-panel"
          >
            <DrawingBoard ref={drawing} notePath={path} />
          </div>
        ) : null}
      </div>

      <Modal
        open={conflict !== null && conflict !== dismissedConflict}
        onClose={() => setDismissedConflict(conflict)}
        title="This note changed in another app"
        description="Autosave is paused so neither version is lost."
        footer={
          conflict === null ? null : (
            <>
              <Button onClick={() => void keepBoth(conflict)}>Keep both</Button>
              <Button onClick={() => adopt(conflict)}>Use the other version</Button>
              <Button variant="primary" onClick={() => void autosaver.current?.overwrite()}>
                Keep mine
              </Button>
            </>
          )
        }
      >
        <p className="text-sm text-secondary">
          Another app saved “{entry.name}” while you were editing it here.{' '}
          <strong>Keep both</strong> saves your version as a copy next to it and shows the other
          version here.
        </p>
      </Modal>
    </section>
  );
}
