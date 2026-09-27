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
} from '@/features/integrations/lib/iliasSync';
import { OpenInIliasButton } from '@/features/integrations/components/OpenInIliasButton';
import { openIliasDownload, revealIliasDownload } from '@/features/integrations/lib/iliasBrowser';
import {
  containerFor,
  dueLabel,
  formatIliasDate,
  formatSize,
  groupByBlock,
  iliasTarget,
  itemKind,
  splitCourseTitle,
  type ItemKind,
} from '@/features/courses/lib/courses';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { FailureNotice, SyncBar } from '@/features/courses/components/CourseNotices';
import { ComposeDialog } from '@/features/mail/components/ComposeDialog';
import { NAV_ITEMS } from '@/lib/navigation';

interface CourseViewProps {
  connection: IliasConnection;
  courseId: string;
  /** The folders opened below the course, outermost first. */
  trail: string[];
  exerciseId: string | null;
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

/** Builds a Courses address; the trail is the folders opened so far. */
function address(courseId: string, trail: string[], exerciseId?: string): string {
  const params = new URLSearchParams({ course: courseId });
  if (trail.length > 0) params.set('trail', trail.join(','));
  if (exerciseId) params.set('exercise', exerciseId);
  return `?${params.toString()}`;
}

export function CourseView({ connection, courseId, trail, exerciseId }: CourseViewProps) {
  const course = useCourseStore((state) =>
    state.courses?.items.find((item) => item.refId === courseId),
  );
  const contents = useCourseStore((state) => state.contents);
  const loadCourses = useCourseStore((state) => state.loadCourses);

  // A course opened from a link, before the list was ever read.
  useEffect(() => {
    if (!course) void loadCourses(connection);
  }, [course, connection, loadCourses]);

  /** An item as its parent listed it — for titles and types along the trail. */
  const listed = (parentId: string, refId: string) =>
    contents[parentId]?.items.find((item) => item.refId === refId);

  const crumbs = trail.map((refId, index) => {
    const parentId = index === 0 ? courseId : (trail[index - 1] ?? courseId);
    return { refId, title: listed(parentId, refId)?.title ?? 'Folder', depth: index + 1 };
  });
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
            <Link to={NAV_ITEMS.courses.path} className="hover:text-accent">
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
              {crumb.title}
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
            {exercise?.title ?? (trail.length > 0 ? crumbs.at(-1)?.title : name)}
          </h2>
          {course?.area && trail.length === 0 && !exerciseId ? (
            <p className="mt-1 text-[12px] text-muted">{course.area}</p>
          ) : null}
        </div>
        <OpenInIliasButton
          url={exerciseId ? iliasTarget('exc', exerciseId) : iliasTarget(container, containerId)}
        />
      </header>

      {exerciseId ? (
        <Assignments
          connection={connection}
          exerciseId={exerciseId}
          courseName={course ? name : null}
        />
      ) : (
        <Contents
          connection={connection}
          container={container}
          containerId={containerId}
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

interface ContentsProps {
  connection: IliasConnection;
  container: IliasContainer;
  containerId: string;
  /** Where a click on an item goes inside Uni Pilot, or null to open it in ILIAS. */
  open: (item: IliasContentItem) => string | null;
}

function Contents({ connection, container, containerId, open }: ContentsProps) {
  const loaded = useCourseStore((state) => state.contents[containerId]);
  const loading = useCourseStore((state) => state.loading[`contents:${containerId}`] === true);
  const loadContents = useCourseStore((state) => state.loadContents);

  useEffect(() => {
    void loadContents(connection, container, containerId);
  }, [connection, container, containerId, loadContents]);

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
                <ItemRow key={item.refId} connection={connection} item={item} to={open(item)} />
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
  item: IliasContentItem;
  to: string | null;
}

function ItemRow({ connection, item, to }: ItemRowProps) {
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
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-secondary">
        <Icon size={17} strokeWidth={1.7} aria-hidden />
      </span>
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
      <li>
        <Link
          to={to}
          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
        >
          {body}
          <ChevronRight size={15} aria-hidden className="shrink-0 text-muted" />
        </Link>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {body}
      {kind === 'file' ? (
        <FileActions connection={connection} item={item} />
      ) : (
        <OpenInIliasButton url={iliasTarget(item.providerType, item.refId)} />
      )}
    </li>
  );
}

/**
 * Download, then Open or Show in folder. Rust saves the file to Downloads and
 * hands back an id; the page opens it by that id, never by a path.
 */
function FileActions({
  connection,
  item,
}: {
  connection: IliasConnection;
  item: IliasContentItem;
}) {
  const download = useCourseStore((state) => state.downloads[item.refId]);
  const start = useCourseStore((state) => state.download);
  const [problem, setProblem] = useState<string | null>(null);

  const handOver = async (action: (id: number) => Promise<void>, id: number) => {
    setProblem(null);
    try {
      await action(id);
    } catch (cause) {
      // Tauri rejects with the Rust error string itself.
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const downloading = download?.state === 'downloading';

  return (
    <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {download?.state === 'saved' ? (
        <>
          <span className="mr-1 text-[11.5px] text-green" aria-live="polite">
            Saved to Downloads
          </span>
          {download.openable ? (
            <Button
              size="sm"
              aria-label={`Open ${item.title}`}
              onClick={() => void handOver(openIliasDownload, download.id)}
              leadingIcon={<ExternalLink size={14} strokeWidth={1.8} aria-hidden />}
            >
              Open
            </Button>
          ) : null}
          <Button
            size="sm"
            aria-label={`Show ${item.title} in its folder`}
            onClick={() => void handOver(revealIliasDownload, download.id)}
            leadingIcon={<FolderOpen size={14} strokeWidth={1.8} aria-hidden />}
          >
            Show in folder
          </Button>
        </>
      ) : (
        <>
          {download?.state === 'failed' ? (
            <span role="alert" className="mr-1 text-[11.5px] text-coral">
              {download.message}
            </span>
          ) : null}
          <Button
            size="sm"
            aria-label={`Download ${item.title}`}
            disabled={downloading}
            onClick={() => void start(connection, item.refId)}
            leadingIcon={
              downloading ? (
                <RefreshCw size={14} strokeWidth={1.8} aria-hidden className="animate-spin" />
              ) : (
                <Download size={14} strokeWidth={1.8} aria-hidden />
              )
            }
          >
            {downloading ? 'Downloading…' : 'Download'}
          </Button>
        </>
      )}
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
