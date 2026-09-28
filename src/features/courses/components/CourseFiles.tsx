import { useEffect, useState } from 'react';
import { FolderOpen, FolderSync, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { IliasBadge } from '@/features/integrations/components/IliasBadge';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type {
  CourseSyncProgress,
  CourseSyncReport,
  IliasCourse,
} from '@/features/integrations/lib/iliasSync';
import { documentsLink, formatSize } from '@/features/courses/lib/courses';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { formatTimeAgo } from '@/lib/date';
import { cn } from '@/lib/utils';

interface SyncSwitchProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** An on/off switch; the label is its accessible name. */
export function SyncSwitch({ label, checked, disabled, onChange }: SyncSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-5 w-9 flex-none items-center rounded-full p-0.5 transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'h-4 w-4 rounded-full bg-surface shadow-soft transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

function progressText(progress: CourseSyncProgress | null): string {
  if (!progress || progress.phase === 'reading') return 'Syncing… reading the course in ILIAS';
  if (progress.phase === 'done') return 'Syncing… almost done';
  const file = progress.title ? ` · ${progress.title}` : '';
  return `Syncing… file ${progress.done + 1} of ${progress.total}${file}`;
}

function reportText(report: CourseSyncReport): string {
  const parts = [
    report.added.length ? `${report.added.length} new` : null,
    report.updated.length ? `${report.updated.length} updated` : null,
    report.kept.length
      ? `${report.kept.length} new ${report.kept.length === 1 ? 'version' : 'versions'} beside your changes`
      : null,
    report.gone ? `${report.gone} no longer on ILIAS, kept here` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : 'Nothing new since the last sync';
}

interface CourseFilesProps {
  connection: IliasConnection;
  course: IliasCourse;
}

/**
 * The course's folder in Documents: switching it on, how the last sync went,
 * and the switches that shape it. The files themselves are listed in the
 * course's contents below, and live in the document explorer.
 */
export function CourseFiles({ connection, course }: CourseFilesProps) {
  const refId = course.refId;
  const loaded = useCourseFilesStore((state) => state.folders !== null);
  const folder = useCourseFilesStore((state) => state.folders?.[refId]);
  const syncing = useCourseFilesStore((state) => refId in state.syncing);
  const progress = useCourseFilesStore((state) => state.syncing[refId] ?? null);
  const report = useCourseFilesStore((state) => state.reports[refId]);
  const failure = useCourseFilesStore((state) => state.failures[refId]);
  const { load, sync, setAuto, stop } = useCourseFilesStore.getState();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!loaded) void load(connection);
  }, [connection, load, loaded]);

  const problem =
    failure && failure.kind !== 'session-expired' ? (
      <p role="alert" className="text-[12px] text-coral">
        {failure.message}
      </p>
    ) : null;

  if (!folder) {
    return (
      <section
        aria-label="Course files"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line-soft bg-surface px-5 py-4"
      >
        <div className="flex max-w-xl items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue">
            <FolderSync size={17} strokeWidth={1.7} aria-hidden />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-primary">
              Keep this course&apos;s files on your computer
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-secondary">
              Uni Pilot saves the course&apos;s ILIAS files in Documents, next to your own notes,
              and brings new ones as they appear. Nothing you change there is overwritten, and
              nothing is deleted when ILIAS removes it. Downloading counts as opening the files in
              ILIAS.
            </p>
            {problem}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={syncing || !loaded}
          onClick={() => void sync(connection, course)}
          leadingIcon={
            <RefreshCw
              size={14}
              strokeWidth={1.8}
              aria-hidden
              className={cn(syncing && 'animate-spin')}
            />
          }
        >
          {syncing ? 'Syncing…' : 'Sync to Documents'}
        </Button>
      </section>
    );
  }

  const status = syncing
    ? progressText(progress)
    : folder.syncedAt
      ? `Last synced ${formatTimeAgo(new Date(folder.syncedAt), new Date())}`
      : 'Not synced completely yet';

  return (
    <section
      aria-label="Course files"
      className="flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
            <IliasBadge size="sm" title="Kept in sync with ILIAS" />
            In your Documents
          </p>
          <Link
            to={documentsLink(folder.root)}
            className="mt-1 block truncate text-[12px] text-secondary hover:text-accent"
          >
            {folder.root}
          </Link>
          <p className="mt-1 text-[11.5px] text-muted" aria-live="polite">
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={syncing}
            onClick={() => void sync(connection, course)}
            leadingIcon={
              <RefreshCw
                size={14}
                strokeWidth={1.8}
                aria-hidden
                className={cn(syncing && 'animate-spin')}
              />
            }
          >
            Sync now
          </Button>
          <Link
            to={documentsLink(folder.root)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary"
          >
            <FolderOpen size={14} strokeWidth={1.8} aria-hidden />
            Open in Documents
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
        <label className="flex items-center gap-2.5 text-[12px] text-secondary">
          <SyncSwitch
            label="Sync automatically"
            checked={folder.auto}
            onChange={(auto) => void setAuto(connection, refId, auto)}
          />
          Sync automatically — every few hours while Uni Pilot runs
        </label>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-secondary">
            The files stay in Documents.
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setConfirming(false);
                void stop(connection, refId);
              }}
            >
              Stop syncing
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" disabled={syncing} onClick={() => setConfirming(true)}>
            Stop syncing…
          </Button>
        )}
      </div>

      {report && !syncing ? (
        <div className="flex flex-col gap-1 text-[12px] text-secondary">
          <p>{reportText(report)}</p>
          {report.tooLarge.length > 0 ? (
            <p className="text-muted">
              Not downloaded on its own, over 100 MB:{' '}
              {report.tooLarge
                .map((file) => {
                  const size = formatSize(file.size);
                  return size ? `${file.title} (${size})` : file.title;
                })
                .join(', ')}
              . Use Download next to them.
            </p>
          ) : null}
          {report.failed.length > 0 ? (
            <ul className="text-coral">
              {report.failed.map((failed) => (
                <li key={failed.title}>
                  {failed.title}: {failed.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {problem}
    </section>
  );
}
