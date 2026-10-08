import { studyEditorLink } from '@/features/documents/lib/studyImport';
import { useEffect, useState } from 'react';
import {
  Box,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  MailPlus,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type {
  IliasAssignment,
  IliasContainer,
  IliasContentItem,
  IliasCourse,
} from '@/features/integrations/lib/iliasSync';
import { IliasBadge } from '@/features/integrations/components/IliasBadge';
import { OpenInIliasButton } from '@/features/integrations/components/OpenInIliasButton';
import { documentRequest } from '@/features/documents/lib/files';
import {
  containerFor,
  documentsLink,
  dueLabel,
  folderOf,
  formatIliasDate,
  formatSize,
  groupByBlock,
  iliasSpaceLink,
  iliasTarget,
  itemKind,
  splitCourseTitle,
  type ItemKind,
} from '@/features/courses/lib/courses';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { FailureNotice, SyncBar } from '@/features/courses/components/CourseNotices';
import { CourseFiles, SyncSwitch } from '@/features/courses/components/CourseFiles';
import { CourseFileIcon } from '@/features/courses/components/CourseFileIcon';
import { ComposeDialog } from '@/features/mail/components/ComposeDialog';

interface CourseViewProps {
  connection: IliasConnection;
  courseId: string;
  /** The folders opened below the course, outermost first. */
  trail: string[];
  exerciseId: string | null;
  onFileSelect: (item: IliasContentItem, course: IliasCourse | undefined, trail: Step[]) => void;
}

/** ILIAS's own heading for a container without item groups; saying it adds nothing. */
const GENERIC_BLOCKS = new Set(['Inhalt', 'Content']);

const ICONS: Record<ItemKind, typeof Folder> = {
  folder: Folder,
  file: FileText,
  exercise: ClipboardList,
  link: Link2,
  other: Box,
};

/** Where a course opens in the ILIAS space; the trail is the folders opened so far. */
function address(courseId: string, trail: string[], exerciseId?: string): string {
  return iliasSpaceLink(courseId, trail, exerciseId);
}

export function CourseView({
  connection,
  courseId,
  trail,
  exerciseId,
  onFileSelect,
}: CourseViewProps) {
  const course = useCourseStore((state) =>
    state.courses?.items.find((item) => item.refId === courseId),
  );
  const contents = useCourseStore((state) => state.contents);
  const loadCourses = useCourseStore((state) => state.loadCourses);
  const loadContents = useCourseStore((state) => state.loadContents);

  // A course opened from a link, before the list was ever read.
  useEffect(() => {
    if (!course) void loadCourses(connection);
  }, [course, connection, loadCourses]);

  /** An item as its parent listed it — for titles and types along the trail. */
  const listed = (parentId: string, refId: string) =>
    contents[parentId]?.items.find((item) => item.refId === refId);

  const parents = trail.map((_, index) =>
    index === 0 ? courseId : (trail[index - 1] ?? courseId),
  );
  const crumbs = trail.map((refId, index) => {
    const title = listed(parents[index] ?? courseId, refId)?.title ?? null;
    return { refId, title, depth: index + 1 };
  });

  // A folder opened from a link: its name, and the names above it, come from
  // the lists they are in. A file saved from here goes into folders by those
  // names, so they are read rather than guessed.
  const unread = parents.filter((parentId) => !contents[parentId]).join(',');
  useEffect(() => {
    for (const parentId of unread ? unread.split(',') : []) {
      const container =
        parentId === courseId ? (containerFor(course?.providerType ?? 'crs') ?? 'crs') : 'fold';
      void loadContents(connection, container, parentId);
    }
  }, [connection, course?.providerType, courseId, loadContents, unread]);
  const containerId = trail.at(-1) ?? courseId;
  const containerParent = trail.length > 1 ? (trail.at(-2) ?? courseId) : courseId;
  const container: IliasContainer =
    trail.length === 0
      ? (containerFor(course?.providerType ?? 'crs') ?? 'crs')
      : (containerFor(listed(containerParent, containerId)?.providerType ?? 'fold') ?? 'fold');

  const { code, name } = splitCourseTitle(course?.title ?? 'Course');
  const exercise = exerciseId ? listed(containerId, exerciseId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Where you are in the course">
        <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <li>
            <Link to={iliasSpaceLink()} className="hover:text-accent">
              All courses
            </Link>
          </li>
          <Crumb to={address(courseId, [])} current={trail.length === 0 && !exerciseId}>
            {name}
          </Crumb>
          {crumbs.map((crumb) => (
            <Crumb
              key={crumb.refId}
              to={address(courseId, trail.slice(0, crumb.depth))}
              current={crumb.depth === trail.length && !exerciseId}
            >
              {crumb.title ?? 'Folder'}
            </Crumb>
          ))}
          {exerciseId ? (
            <Crumb to={address(courseId, trail, exerciseId)} current>
              {exercise?.title ?? 'Exercise'}
            </Crumb>
          ) : null}
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line-soft bg-surface px-5 py-4">
        <div className="min-w-0">
          {code ? (
            <p className="text-[10px] font-semibold tracking-[0.07em] text-accent">{code}</p>
          ) : null}
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">
            {exercise?.title ?? (trail.length > 0 ? (crumbs.at(-1)?.title ?? 'Folder') : name)}
          </h2>
          {course?.area && trail.length === 0 && !exerciseId ? (
            <p className="mt-1 text-[12px] text-muted">{course.area}</p>
          ) : null}
        </div>
        <OpenInIliasButton
          url={exerciseId ? iliasTarget('exc', exerciseId) : iliasTarget(container, containerId)}
        />
      </header>

      {course && trail.length === 0 && !exerciseId ? (
        <CourseFiles connection={connection} course={course} />
      ) : null}

      {exerciseId ? (
        <Assignments
          connection={connection}
          exerciseId={exerciseId}
          courseName={course ? name : null}
        />
      ) : (
        <Contents
          connection={connection}
          course={course}
          trail={crumbs.map(({ refId, title }) => ({ refId, title }))}
          container={container}
          containerId={containerId}
          onFileSelect={onFileSelect}
          open={(item) => {
            if (itemKind(item.providerType) === 'folder') {
              return address(courseId, [...trail, item.refId]);
            }
            if (item.providerType === 'exc') return address(courseId, trail, item.refId);
            return null;
          }}
        />
      )}
    </div>
  );
}

function Crumb({ to, current, children }: { to: string; current: boolean; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <ChevronRight size={12} aria-hidden />
      {current ? (
        <span aria-current="page" className="font-medium text-secondary">
          {children}
        </span>
      ) : (
        <Link to={to} className="hover:text-accent">
          {children}
        </Link>
      )}
    </li>
  );
}

/** An ILIAS folder on the way to the one shown, outermost first; null until its name is read. */
interface Step {
  refId: string;
  title: string | null;
}

interface ContentsProps {
  connection: IliasConnection;
  /** Undefined until the course list is read. */
  course: IliasCourse | undefined;
  trail: Step[];
  container: IliasContainer;
  containerId: string;
  /** Where a click on an item goes inside Uni Pilot, or null to open it in ILIAS. */
  open: (item: IliasContentItem) => string | null;
  onFileSelect: (item: IliasContentItem, course: IliasCourse | undefined, trail: Step[]) => void;
}

function Contents({
  connection,
  course,
  trail,
  container,
  containerId,
  open,
  onFileSelect,
}: ContentsProps) {
  const loaded = useCourseStore((state) => state.contents[containerId]);
  const loading = useCourseStore((state) => state.loading[`contents:${containerId}`] === true);
  const loadContents = useCourseStore((state) => state.loadContents);
  const foldersRead = useCourseFilesStore((state) => state.folders !== null);
  const loadFolders = useCourseFilesStore((state) => state.load);

  useEffect(() => {
    void loadContents(connection, container, containerId);
  }, [connection, container, containerId, loadContents]);

  // Which files are on this computer already, for a folder opened by a link.
  useEffect(() => {
    if (!foldersRead) void loadFolders(connection);
  }, [connection, foldersRead, loadFolders]);

  const refresh = () => void loadContents(connection, container, containerId);
  const blocks = groupByBlock(loaded?.items ?? []);
  const onlyGeneric = blocks.length === 1 && GENERIC_BLOCKS.has(blocks[0]?.title ?? '');

  return (
    <div className="flex flex-col gap-5">
      <SyncBar
        label="From ILIAS"
        loadedAt={loaded?.loadedAt ?? null}
        loading={loading}
        onRefresh={refresh}
      />
      <FailureNotice onRetry={refresh} />

      {!loaded && loading ? <p className="text-[13px] text-secondary">Reading ILIAS…</p> : null}
      {loaded && loaded.items.length === 0 ? (
        <p className="text-[13px] text-secondary">
          Nothing here in ILIAS right now. Lecturers often take files offline once a semester is
          over.
        </p>
      ) : null}

      {blocks.map((block, index) => {
        const headingId = `block-${containerId}-${index}`;
        const showHeading = block.title && !onlyGeneric;
        return (
          <section
            key={`${block.title ?? ''}-${index}`}
            aria-labelledby={showHeading ? headingId : undefined}
            aria-label={showHeading ? undefined : 'Contents'}
            className="flex flex-col gap-2"
          >
            {showHeading ? (
              <h3
                id={headingId}
                className="text-[13px] font-semibold tracking-tight text-secondary"
              >
                {block.title}
              </h3>
            ) : null}
            <ul className="flex flex-col divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
              {block.items.map((item) => (
                <ItemRow
                  key={item.refId}
                  connection={connection}
                  course={course}
                  trail={trail}
                  item={item}
                  to={open(item)}
                  onFileSelect={onFileSelect}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface ItemRowProps {
  connection: IliasConnection;
  course: IliasCourse | undefined;
  trail: Step[];
  item: IliasContentItem;
  to: string | null;
  onFileSelect: (item: IliasContentItem, course: IliasCourse | undefined, trail: Step[]) => void;
}

function ItemRow({ connection, course, trail, item, to, onFileSelect }: ItemRowProps) {
  const kind = itemKind(item.providerType);
  const Icon = ICONS[kind];
  const facts = item.file
    ? [
        item.file.suffix?.toUpperCase(),
        formatSize(item.file.size),
        formatIliasDate(item.file.updatedAt),
      ].filter((fact): fact is string => Boolean(fact))
    : [];

  const body = (
    <>
      {kind === 'file' ? (
        <CourseFileIcon title={item.title} suffix={item.file?.suffix ?? null} />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-secondary">
          <Icon size={17} strokeWidth={1.7} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-primary">{item.title}</span>
          {item.file && item.file.version > 1 ? (
            <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[10px] font-medium text-orange">
              Version {item.file.version}
            </span>
          ) : null}
        </span>
        {item.description ? (
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">{item.description}</span>
        ) : null}
        {facts.length > 0 ? (
          <span className="mt-0.5 block text-[11.5px] text-muted">{facts.join(' · ')}</span>
        ) : null}
      </span>
    </>
  );

  if (to) {
    return (
      <li className="flex items-center">
        <Link
          to={to}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
        >
          {body}
          <ChevronRight size={15} aria-hidden className="shrink-0 text-muted" />
        </Link>
        {kind === 'folder' && course ? (
          <FolderSwitch connection={connection} courseRefId={course.refId} item={item} />
        ) : null}
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {kind === 'file' ? (
        <button
          type="button"
          aria-label={`Show details for ${item.title}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onFileSelect(item, course, trail)}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {kind === 'file' ? (
        <FileActions connection={connection} course={course} trail={trail} item={item} />
      ) : (
        <OpenInIliasButton url={iliasTarget(item.providerType, item.refId)} />
      )}
    </li>
  );
}

/** Whether the course sync reads a folder. Only for a course that syncs. */
function FolderSwitch({
  connection,
  courseRefId,
  item,
}: {
  connection: IliasConnection;
  courseRefId: string;
  item: IliasContentItem;
}) {
  const folder = useCourseFilesStore((state) => state.folders?.[courseRefId]);
  const setFolderSynced = useCourseFilesStore((state) => state.setFolderSynced);
  if (!folder) return null;
  return (
    <span className="shrink-0 pr-4">
      <SyncSwitch
        label={`Sync ${item.title}`}
        checked={!folder.excluded.includes(item.refId)}
        onChange={(synced) => void setFolderSynced(connection, courseRefId, item.refId, synced)}
      />
    </span>
  );
}

/**
 * A file on this computer opens from the course's folder in Documents; one
 * that is not is downloaded there with a click, where the sync would put it.
 */
function FileActions({
  connection,
  course,
  trail,
  item,
}: {
  connection: IliasConnection;
  course: IliasCourse | undefined;
  trail: Step[];
  item: IliasContentItem;
}) {
  const tracked = useCourseFilesStore((state) =>
    course ? state.folders?.[course.refId]?.files[item.refId] : undefined,
  );
  const saving = useCourseFilesStore((state) => state.saving[item.refId]);
  const saveFile = useCourseFilesStore((state) => state.saveFile);
  const [problem, setProblem] = useState<string | null>(null);

  const local =
    saving?.state === 'saved'
      ? saving.file
      : tracked && tracked.state !== 'removed'
        ? tracked
        : null;
  const current = local !== null && local.version >= (item.file?.version ?? 1);
  const busy = saving?.state === 'saving';
  // Saving needs the names of the folders it goes into.
  const named = trail.every((step) => step.title !== null)
    ? trail.map((step) => ({ refId: step.refId, title: step.title ?? '' }))
    : null;

  const open = async (path: string) => {
    setProblem(null);
    try {
      await documentRequest({ action: 'open', path });
    } catch (cause) {
      // Tauri rejects with the Rust error string itself.
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {local ? (
        <>
          <span
            className="mr-1 flex items-center gap-1.5 text-[11.5px] text-green"
            aria-live="polite"
          >
            <IliasBadge size="sm" showLabel={false} title="Downloaded from ILIAS" />
            {current ? 'On this computer' : `Version ${local.version} on this computer`}
          </span>
          <Button
            size="sm"
            aria-label={`Open ${item.title}`}
            onClick={() => void open(local.path)}
            leadingIcon={<ExternalLink size={14} strokeWidth={1.8} aria-hidden />}
          >
            Open
          </Button>
          {/\.(pdf|png|jpe?g|gif|webp|bmp|avif|md|markdown|txt)$/i.test(local.path) ? (
            <Link
              to={studyEditorLink(local.path)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
            >
              Aufschreiben
            </Link>
          ) : null}
          <Link
            to={documentsLink(folderOf(local.path))}
            aria-label={`Show ${item.title} in Documents`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <FolderOpen size={14} strokeWidth={1.8} aria-hidden />
            In Documents
          </Link>
        </>
      ) : null}
      {!current ? (
        <>
          {saving?.state === 'failed' ? (
            <span role="alert" className="mr-1 text-[11.5px] text-coral">
              {saving.message}
            </span>
          ) : null}
          <Button
            size="sm"
            aria-label={`${local ? 'Update' : 'Download'} ${item.title}`}
            disabled={busy || !course || !named}
            onClick={() => {
              if (course && named) void saveFile(connection, course, named, item);
            }}
            leadingIcon={
              busy ? (
                <RefreshCw size={14} strokeWidth={1.8} aria-hidden className="animate-spin" />
              ) : (
                <Download size={14} strokeWidth={1.8} aria-hidden />
              )
            }
          >
            {busy ? 'Downloading…' : local ? 'Update' : 'Download'}
          </Button>
        </>
      ) : null}
      {problem ? (
        <span role="alert" className="text-[11.5px] text-coral">
          {problem}
        </span>
      ) : null}
      <OpenInIliasButton compact url={iliasTarget(item.providerType, item.refId)} />
    </span>
  );
}

function Assignments({
  connection,
  exerciseId,
  courseName,
}: {
  connection: IliasConnection;
  exerciseId: string;
  /** For the subject of a question by email; null until the course list is read. */
  courseName: string | null;
}) {
  const [asking, setAsking] = useState<IliasAssignment | null>(null);
  const loaded = useCourseStore((state) => state.assignments[exerciseId]);
  const loading = useCourseStore((state) => state.loading[`assignments:${exerciseId}`] === true);
  const loadAssignments = useCourseStore((state) => state.loadAssignments);

  useEffect(() => {
    void loadAssignments(connection, exerciseId);
  }, [connection, exerciseId, loadAssignments]);

  const refresh = () => void loadAssignments(connection, exerciseId);
  const sections: { title: string; items: IliasAssignment[] }[] = [];
  for (const assignment of loaded?.items ?? []) {
    const title = assignment.section ?? 'Assignments';
    const section = sections.find((known) => known.title === title);
    if (section) section.items.push(assignment);
    else sections.push({ title, items: [assignment] });
  }
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <SyncBar
        label="From ILIAS"
        loadedAt={loaded?.loadedAt ?? null}
        loading={loading}
        onRefresh={refresh}
      />
      <FailureNotice onRetry={refresh} />

      {!loaded && loading ? <p className="text-[13px] text-secondary">Reading ILIAS…</p> : null}
      {loaded && loaded.items.length === 0 ? (
        <p className="text-[13px] text-secondary">This exercise has no assignments.</p>
      ) : null}

      {sections.map((section, index) => {
        const headingId = `assignments-${exerciseId}-${index}`;
        return (
          <section key={section.title} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3 id={headingId} className="text-[13px] font-semibold tracking-tight text-secondary">
              {section.title}
            </h3>
            <ul className="flex flex-col divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
              {section.items.map((assignment) => {
                const due = dueLabel(assignment.dueAt, now);
                const handedIn = formatIliasDate(assignment.submittedAt);
                return (
                  <li key={assignment.assId} className="flex flex-col gap-2 px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-primary">
                        {assignment.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        aria-label={`Email about ${assignment.title}`}
                        onClick={() => setAsking(assignment)}
                        leadingIcon={<MailPlus size={14} strokeWidth={1.8} aria-hidden />}
                      >
                        Email about this
                      </Button>
                      {assignment.mandatory !== null ? (
                        <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-secondary">
                          {assignment.mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted">
                      {assignment.dueAt ? (
                        <span>
                          {due ? `${due} · ` : ''}
                          {formatIliasDate(assignment.dueAt)}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1.5">
                        {handedIn ? (
                          <>
                            <CircleCheck size={13} aria-hidden className="text-green" />
                            Handed in {handedIn}
                          </>
                        ) : (
                          <>
                            <CircleDashed size={13} aria-hidden />
                            Not handed in
                          </>
                        )}
                      </span>
                      {assignment.grade ? <span>{assignment.grade}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {asking ? (
        <ComposeDialog
          onClose={() => setAsking(null)}
          initial={{ subject: courseName ? `${courseName} – ${asking.title}` : asking.title }}
        />
      ) : null}
    </div>
  );
}
