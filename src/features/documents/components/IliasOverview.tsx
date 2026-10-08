import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, EyeOff, GraduationCap, Plus, School } from 'lucide-react';
import { FolderArtwork } from './FolderArtwork';
import { IliasFileDetails, type IliasFileSelection } from './IliasFileDetails';
import { NewBadge } from './NewBadge';
import { CourseFileIcon } from '@/features/courses/components/CourseFileIcon';
import { CourseView } from '@/features/courses/components/CourseView';
import { EmptyState, FailureNotice, SyncBar } from '@/features/courses/components/CourseNotices';
import {
  containerFor,
  iliasSpaceLink,
  splitCourseTitle,
  type CourseFileKind,
} from '@/features/courses/lib/courses';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { hostOf, useCourseStore } from '@/features/courses/store/courseStore';
import { type DocumentEntry, type IliasCourse } from '@/features/documents/lib/files';
import { folderTone } from '@/features/documents/lib/folderTone';
import {
  COURSE_DRAG,
  courseCards,
  iliasEntry,
  keptCourses,
  newestFiles,
  offlineCourses,
  peekFolder,
  type CourseCard,
  type IliasCourseView,
} from '@/features/documents/lib/iliasSpace';
import { recentIliasFiles } from '@/features/documents/lib/recentIliasFiles';
import { IliasBadge } from '@/features/integrations';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { canEmbedIlias } from '@/features/integrations/lib/iliasView';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { formatShortDayLabel, formatTimeAgo } from '@/lib/date';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** How many of the newest files show before "Show all". */
const NEWEST = 15;
const INDEX_FRESH_MS = 15 * 60 * 1000;

type FileStatus = 'all' | 'documents' | 'ilias' | 'gone';
type FileSort = 'newest' | 'oldest' | 'name';
const FILE_KINDS: { value: CourseFileKind; label: string }[] = [
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documents' },
  { value: 'presentation', label: 'Presentations' },
  { value: 'spreadsheet', label: 'Spreadsheets' },
  { value: 'image', label: 'Images' },
  { value: 'other', label: 'Other files' },
];

interface IliasOverviewProps {
  /** The courses Documents keeps; `null` while they are read. */
  courses: IliasCourse[] | null;
  /** The course open in the space, or `null` for all of them. */
  course: IliasCourseView | null;
  onOpen: (entry: DocumentEntry) => void;
  onEdit?: (entry: DocumentEntry) => void;
  onAddCourse: (courseId: string) => void;
  onAddAllCourses: () => void;
}

/**
 * The ILIAS space: every course side by side, and below them the newest files
 * across those courses. A course opens here as ILIAS has it — folders,
 * exercises and whether its files sync. Lists, not a canvas: ILIAS files
 * arrive, the student does not arrange them.
 */
export function IliasOverview({
  courses,
  course,
  onOpen,
  onEdit,
  onAddCourse,
  onAddAllCourses,
}: IliasOverviewProps) {
  const connection = useIliasStore((state) => state.connection);
  const desktop = canEmbedIlias();
  const [selection, setSelection] = useState<IliasFileSelection | null>(null);

  return (
    <section className="ilias-overview" aria-label="ILIAS">
      <div className="ilias-overview-main scroll-area">
        {!desktop ? (
          <EmptyState icon={GraduationCap} title="Your courses come from the desktop app">
            Uni Pilot reads your ILIAS courses with the sign-in of its ILIAS view, and only the
            desktop app has one. Open Uni Pilot there to see them.
          </EmptyState>
        ) : course && connection ? (
          <CourseView
            connection={connection}
            courseId={course.courseId}
            trail={course.trail}
            exerciseId={course.exerciseId}
            onFileSelect={(item, selectedCourse, trail) =>
              setSelection({ kind: 'course', item, course: selectedCourse, trail })
            }
          />
        ) : (
          <Overview
            connection={connection}
            synced={courses}
            onOpen={onOpen}
            onSelect={setSelection}
            onAddCourse={onAddCourse}
            onAddAllCourses={onAddAllCourses}
          />
        )}
      </div>
      {selection ? (
        <IliasFileDetails
          key={selection.kind === 'saved' ? selection.file.path : selection.item.refId}
          selection={selection}
          onEdit={
            onEdit
              ? (entry) => {
                  setSelection(null);
                  onEdit(entry);
                }
              : undefined
          }
          onClose={() => setSelection(null)}
        />
      ) : null}
    </section>
  );
}

function Overview({
  connection,
  synced,
  onOpen,
  onSelect,
  onAddCourse,
  onAddAllCourses,
}: {
  connection: IliasConnection | null;
  synced: IliasCourse[] | null;
  onOpen: (entry: DocumentEntry) => void;
  onSelect: (selection: IliasFileSelection) => void;
  onAddCourse: (courseId: string) => void;
  onAddAllCourses: () => void;
}) {
  const listed = useCourseStore((state) => state.courses);
  const installation = useCourseStore((state) => state.installation);
  const contents = useCourseStore((state) => state.contents);
  const loading = useCourseStore((state) => state.loading.courses === true);
  const loadCourses = useCourseStore((state) => state.loadCourses);
  const loadContents = useCourseStore((state) => state.loadContents);
  const loadFolders = useCourseFilesStore((state) => state.load);
  const folders = useCourseFilesStore((state) => state.folders);
  const waiting = useCourseFilesStore((state) => state.waiting.length);
  const [all, setAll] = useState(false);
  const [courseFilter, setCourseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<CourseFileKind | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FileStatus>('all');
  const [sort, setSort] = useState<FileSort>('newest');
  const [indexing, setIndexing] = useState(false);
  const [scanRevision, setScanRevision] = useState(0);

  useEffect(() => {
    if (!connection) return;
    void loadCourses(connection);
    void loadFolders(connection);
  }, [connection, loadCourses, loadFolders]);

  // File metadata is read without downloading. Walk the course tree in the
  // background, reusing recent cached listings and stopping after a sign-in
  // failure. The cached tree remains useful while ILIAS is unavailable.
  const onlineIds =
    listed?.items
      .filter((item) => item.online)
      .map((item) => `${item.providerType}:${item.refId}`)
      .join('|') ?? '';
  useEffect(() => {
    if (!connection || !onlineIds || installation !== hostOf(connection)) return;
    let active = true;
    let canRead = true;
    const queue = onlineIds.split('|').map((part) => {
      const [providerType, refId] = part.split(':');
      return { providerType: providerType ?? 'crs', refId: refId ?? '' };
    });
    const seen = new Set<string>();
    const worker = async () => {
      while (active && queue.length > 0) {
        const next = queue.shift();
        if (!next?.refId || seen.has(next.refId)) continue;
        seen.add(next.refId);
        const previous = useCourseStore.getState().contents[next.refId];
        const fresh =
          scanRevision === 0 &&
          previous &&
          Date.now() - new Date(previous.loadedAt).getTime() < INDEX_FRESH_MS;
        if (canRead && !fresh) {
          await loadContents(connection, containerFor(next.providerType) ?? 'fold', next.refId);
          if (useCourseStore.getState().failure?.kind === 'session-expired') canRead = false;
        }
        for (const item of useCourseStore.getState().contents[next.refId]?.items ?? []) {
          if (containerFor(item.providerType))
            queue.push({ providerType: item.providerType, refId: item.refId });
        }
      }
    };
    void Promise.resolve().then(async () => {
      if (!active) return;
      setIndexing(true);
      try {
        await Promise.all([worker(), worker()]);
      } finally {
        if (active) setIndexing(false);
      }
    });
    return () => {
      active = false;
    };
  }, [connection, installation, loadContents, onlineIds, scanRevision]);

  const kept = keptCourses(synced ?? [], folders);
  const cards = courseCards(listed?.items ?? [], kept);
  const offline = offlineCourses(listed?.items ?? [], kept);
  const files = recentIliasFiles(listed?.items ?? [], contents, newestFiles(kept));
  const remote = cards.filter((card) => !card.synced).length;
  const courseOptions = Array.from(
    new Map(files.map((file) => [file.courseId, file.courseTitle])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = files
    .filter(
      (file) =>
        (courseFilter === 'all' || file.courseId === courseFilter) &&
        (typeFilter === 'all' || file.kind === typeFilter) &&
        (statusFilter === 'all' || file.status === statusFilter),
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (a.time === null) return b.time === null ? 0 : 1;
      if (b.time === null) return -1;
      const difference = b.time - a.time;
      return sort === 'newest' ? difference : -difference;
    });
  const shown = all ? filtered : filtered.slice(0, NEWEST);
  const refresh = () => {
    if (connection) void loadCourses(connection);
    if (!indexing) setScanRevision((revision) => revision + 1);
  };

  return (
    <div className="flex flex-col gap-2">
      <header className="ilias-overview-head">
        <h2>ILIAS</h2>
        <p>Your courses as ILIAS has them. Bring one into Documents to keep its files.</p>
      </header>

      {connection ? (
        <div className="mt-3 flex flex-col gap-3">
          <SyncBar
            label={`From ILIAS · ${connection.name}`}
            loadedAt={listed?.loadedAt ?? null}
            loading={loading}
            onRefresh={refresh}
          />
          <FailureNotice onRetry={refresh} />
        </div>
      ) : (
        <div className="ilias-overview-empty">
          <School size={20} className="text-accent" aria-hidden />
          <p className="font-medium">Connect ILIAS to see your courses</p>
          <p className="text-secondary">
            Your courses, their folders and files, and your exercises with their deadlines — read
            from ILIAS with your own sign-in. Uni Pilot never sees your password.
          </p>
          <Link to={NAV_ITEMS.ilias.path} className="text-accent hover:underline">
            Connect ILIAS
          </Link>
        </div>
      )}

      <h3 className="ilias-overview-title">Courses</h3>
      {cards.length === 0 ? (
        <p className="ilias-overview-hint">
          {!connection
            ? 'Your courses show here once ILIAS is connected.'
            : !listed && loading
              ? 'Reading your courses from ILIAS…'
              : 'ILIAS lists no courses or groups for you.'}
        </p>
      ) : (
        <>
          <ul className="ilias-courses" aria-label="Your courses">
            {cards.map((card) => (
              <CourseFolder key={card.refId} card={card} onAdd={onAddCourse} />
            ))}
          </ul>
          {remote > 0 ? (
            <div className="ilias-overview-add-all">
              {connection && remote > 1 ? (
                <button type="button" disabled={waiting > 0} onClick={onAddAllCourses}>
                  <Download size={14} aria-hidden />
                  {waiting > 0 ? `${waiting} waiting to be added…` : `Add all ${remote} courses`}
                </button>
              ) : null}
              <p className="ilias-overview-hint">
                Drag a course onto Documents in the dock, or choose Add to Documents. Its files are
                then kept on this Mac, also offline. Downloading counts as opening the files in
                ILIAS.
              </p>
            </div>
          ) : null}
        </>
      )}

      <div className="ilias-files-heading">
        <h3 className="ilias-overview-title">Newest files</h3>
        <span>{indexing ? 'Reading courses…' : `${filtered.length} files`}</span>
      </div>
      <div className="ilias-files-filters" aria-label="Filter files">
        <label>
          <span>Course</span>
          <select
            value={courseFilter}
            onChange={(event) => {
              setCourseFilter(event.target.value);
              setAll(false);
            }}
          >
            <option value="all">All courses</option>
            {courseOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {splitCourseTitle(title).name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value as CourseFileKind | 'all');
              setAll(false);
            }}
          >
            <option value="all">All types</option>
            {FILE_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as FileStatus);
              setAll(false);
            }}
          >
            <option value="all">Everywhere</option>
            <option value="documents">In Documents</option>
            <option value="ilias">On ILIAS</option>
            <option value="gone">No longer on ILIAS</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as FileSort);
              setAll(false);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">File name</option>
          </select>
        </label>
      </div>
      {files.length === 0 ? (
        <p className="ilias-overview-hint">
          {indexing
            ? 'Reading files from your ILIAS courses…'
            : 'No files found in your courses yet.'}
        </p>
      ) : filtered.length === 0 ? (
        <p className="ilias-overview-hint">No files match these filters.</p>
      ) : (
        <table className="ilias-files">
          <caption className="sr-only">Newest files from all your courses</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Course</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const file = row.source === 'saved' ? row.file : null;
              return (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        if (row.source === 'saved') {
                          onSelect({ kind: 'saved', file: row.file });
                          onOpen(iliasEntry(row.file));
                        } else {
                          onSelect({
                            kind: 'course',
                            item: row.item,
                            course: row.course,
                            trail: row.trail,
                          });
                        }
                      }}
                    >
                      <CourseFileIcon
                        title={row.name}
                        suffix={row.source === 'ilias' ? (row.item.file?.suffix ?? null) : null}
                        size="sm"
                      />
                      <span>{row.name}</span>
                      {file?.unseen ? ' ' : null}
                      <NewBadge count={file?.unseen ? 1 : 0} file />
                    </button>
                    {row.status === 'gone' ? (
                      <span className="ilias-file-gone">No longer on ILIAS</span>
                    ) : row.status === 'ilias' ? (
                      <span className="ilias-file-gone">On ILIAS</span>
                    ) : null}
                  </td>
                  <td>{splitCourseTitle(row.courseTitle).name}</td>
                  <td>
                    {row.time === null
                      ? 'Date unavailable'
                      : formatShortDayLabel(new Date(row.time))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {filtered.length > NEWEST ? (
        <button type="button" className="ilias-overview-more" onClick={() => setAll(!all)}>
          {all ? 'Show first 15' : `Show all ${filtered.length} files`}
        </button>
      ) : null}

      {offline.length > 0 ? (
        <section aria-labelledby="ilias-offline" className="mt-2">
          <h3 id="ilias-offline" className="ilias-overview-title flex items-center gap-2">
            <EyeOff size={14} strokeWidth={1.8} aria-hidden />
            Offline in ILIAS
          </h3>
          <p className="ilias-overview-hint">
            You are still a member, but ILIAS does not open these right now — usually because the
            semester is over or has not started.
          </p>
          <ul className="ilias-offline">
            {offline.map((item) => {
              const { code, name } = splitCourseTitle(item.title);
              return (
                <li key={item.refId}>
                  <span>
                    {code ? <span className="mr-2 text-[11px] text-muted">{code}</span> : null}
                    {name}
                  </span>
                  {item.area ? <span className="text-[11px] text-muted">{item.area}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A course as a folder: coloured and full once Documents keeps it, pale until then. */
function CourseFolder({ card, onAdd }: { card: CourseCard; onAdd: (courseId: string) => void }) {
  const progress = useCourseFilesStore((state) =>
    card.refId in state.syncing ? (state.syncing[card.refId] ?? null) : undefined,
  );
  const failure = useCourseFilesStore((state) => state.failures[card.refId]);
  const waiting = useCourseFilesStore((state) =>
    state.waiting.some((course) => course.refId === card.refId),
  );
  const synced = card.synced;
  const unseen = synced?.unseen ?? 0;
  const status = synced
    ? synced.syncedAt
      ? `In Documents · synced ${formatTimeAgo(new Date(synced.syncedAt), new Date())}`
      : 'In Documents'
    : 'Not in Documents';
  const peek: DocumentEntry = {
    name: card.name,
    path: synced ? peekFolder(synced) : '',
    folder: true,
    size: 0,
    modified: synced?.syncedAt ? Date.parse(synced.syncedAt) : 0,
  };

  return (
    <li className="ilias-course-item">
      <Link
        to={iliasSpaceLink(card.refId)}
        className={cn('ilias-course', !synced && 'is-remote')}
        aria-label={unseen ? `${card.name}, ${unseen} new` : card.name}
        title={card.title}
        draggable={!synced}
        onDragStart={(event) => {
          event.dataTransfer.setData(COURSE_DRAG, card.refId);
          event.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className={cn('ilias-course-folder', `tone-${folderTone(card.name)}`)}>
          <FolderArtwork entry={peek} enabled={!!synced} />
        </span>
        <IliasBadge size="sm" showLabel={false} className="ilias-course-badge" />
        <NewBadge count={unseen} className="ilias-course-new" />
        <strong>{card.name}</strong>
        <span className="ilias-course-meta">
          {card.code ? <span>{card.code}</span> : null}
          <span>{status}</span>
        </span>
      </Link>
      {synced ? null : progress !== undefined ? (
        <p className="ilias-course-progress" role="status">
          {progress?.total
            ? `Adding · ${progress.done} of ${progress.total}`
            : 'Adding to Documents…'}
        </p>
      ) : waiting ? (
        <p className="ilias-course-progress" role="status">
          Waiting…
        </p>
      ) : (
        <button type="button" className="ilias-course-add" onClick={() => onAdd(card.refId)}>
          <Plus size={13} aria-hidden />
          Add to Documents
        </button>
      )}
      {failure && !synced ? (
        <p className="ilias-course-failure" role="alert">
          {failure.message}
        </p>
      ) : null}
    </li>
  );
}
