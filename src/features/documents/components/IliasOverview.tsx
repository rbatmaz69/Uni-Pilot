import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, File, FileText, GraduationCap, Plus, School } from 'lucide-react';
import { FolderArtwork } from './FolderArtwork';
import { NewBadge } from './NewBadge';
import { CourseView } from '@/features/courses/components/CourseView';
import { EmptyState, FailureNotice, SyncBar } from '@/features/courses/components/CourseNotices';
import { iliasSpaceLink, splitCourseTitle } from '@/features/courses/lib/courses';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { editable, type DocumentEntry, type IliasCourse } from '@/features/documents/lib/files';
import { folderTone } from '@/features/documents/lib/folderTone';
import {
  addedAt,
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
import { IliasBadge } from '@/features/integrations';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { canEmbedIlias } from '@/features/integrations/lib/iliasView';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { formatShortDayLabel, formatTimeAgo } from '@/lib/date';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** How many of the newest files show before "Show all". */
const NEWEST = 40;

interface IliasOverviewProps {
  /** The courses Documents keeps; `null` while they are read. */
  courses: IliasCourse[] | null;
  /** The course open in the space, or `null` for all of them. */
  course: IliasCourseView | null;
  onOpen: (entry: DocumentEntry) => void;
  onAddCourse: (courseId: string) => void;
}

/**
 * The ILIAS space: every course side by side, and below them the newest files
 * of the ones Documents keeps. A course opens here as ILIAS has it — folders,
 * exercises and whether its files sync. Lists, not a canvas: ILIAS files
 * arrive, the student does not arrange them.
 */
export function IliasOverview({ courses, course, onOpen, onAddCourse }: IliasOverviewProps) {
  const connection = useIliasStore((state) => state.connection);
  const desktop = canEmbedIlias();

  return (
    <section className="ilias-overview scroll-area" aria-label="ILIAS">
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
        />
      ) : (
        <Overview
          connection={connection}
          synced={courses}
          onOpen={onOpen}
          onAddCourse={onAddCourse}
        />
      )}
    </section>
  );
}

function Overview({
  connection,
  synced,
  onOpen,
  onAddCourse,
}: {
  connection: IliasConnection | null;
  synced: IliasCourse[] | null;
  onOpen: (entry: DocumentEntry) => void;
  onAddCourse: (courseId: string) => void;
}) {
  const listed = useCourseStore((state) => state.courses);
  const loading = useCourseStore((state) => state.loading.courses === true);
  const loadCourses = useCourseStore((state) => state.loadCourses);
  const loadFolders = useCourseFilesStore((state) => state.load);
  const folders = useCourseFilesStore((state) => state.folders);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!connection) return;
    void loadCourses(connection);
    void loadFolders(connection);
  }, [connection, loadCourses, loadFolders]);

  const kept = keptCourses(synced ?? [], folders);
  const cards = courseCards(listed?.items ?? [], kept);
  const offline = offlineCourses(listed?.items ?? [], kept);
  const files = newestFiles(kept);
  const shown = all ? files : files.slice(0, NEWEST);
  const refresh = () => {
    if (connection) void loadCourses(connection);
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
          {cards.some((card) => !card.synced) ? (
            <p className="ilias-overview-hint">
              Drag a course onto Documents in the dock, or choose Add to Documents. Downloading
              counts as opening the files in ILIAS.
            </p>
          ) : null}
        </>
      )}

      <h3 className="ilias-overview-title">Newest files</h3>
      {files.length === 0 ? (
        <p className="ilias-overview-hint">
          Nothing has arrived yet. Files come here once a course is in Documents.
        </p>
      ) : (
        <table className="ilias-files">
          <caption className="sr-only">Newest files from all your courses</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Course</th>
              <th scope="col">Added</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((file) => {
              const entry = iliasEntry(file);
              const Icon = editable(entry) ? FileText : File;
              return (
                <tr key={file.path}>
                  <td>
                    <button type="button" onClick={() => onOpen(entry)}>
                      <Icon size={16} strokeWidth={1.7} aria-hidden />
                      <span>{file.name}</span>
                      {file.unseen ? ' ' : null}
                      <NewBadge count={file.unseen ? 1 : 0} file />
                    </button>
                    {file.gone ? <span className="ilias-file-gone">No longer on ILIAS</span> : null}
                  </td>
                  <td>{splitCourseTitle(file.course.title).name}</td>
                  <td>{formatShortDayLabel(new Date(addedAt(file)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {files.length > NEWEST ? (
        <button type="button" className="ilias-overview-more" onClick={() => setAll(!all)}>
          {all ? 'Show only the newest' : 'Show all files'}
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
