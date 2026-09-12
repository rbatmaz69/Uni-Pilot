import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { CircleCheck, FileUp, Globe, Link2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { Button, IconButton, Modal } from '@/components/ui';
import { formatTimeAgo } from '@/lib/date';
import { describeIcsHost, isDesktopRuntime } from '@/lib/icsFetch';
import { cn } from '@/lib/utils';
import { useSourceStore, type CalendarSource } from '@/features/calendar/store/sourceStore';

interface CalendarSourcesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Lets the calendar jump to whatever was just added. */
  onSourceAdded: (source: CalendarSource) => void;
}

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';

export function CalendarSourcesDialog({
  open,
  onClose,
  onSourceAdded,
}: CalendarSourcesDialogProps) {
  const urlId = useId();
  const fileId = useId();
  const sources = useSourceStore((state) => state.sources);
  const syncingIds = useSourceStore((state) => state.syncingIds);
  const subscribe = useSourceStore((state) => state.subscribe);
  const importFile = useSourceStore((state) => state.importFile);
  const refresh = useSourceStore((state) => state.refresh);
  const remove = useSourceStore((state) => state.remove);

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const report = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'That did not work.');

  const handleSubscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const source = await subscribe(url);
      setUrl('');
      setNotice(`Added ${source.events.length} entries from ${source.name}.`);
      onSourceAdded(source);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);
    setNotice(null);
    try {
      const source = importFile(file.name, await file.text());
      setNotice(`Added ${source.events.length} entries from ${source.name}.`);
      onSourceAdded(source);
    } catch (cause) {
      report(cause);
    } finally {
      // Clearing the input allows re-picking the same file after a fix.
      input.value = '';
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Calendar sources"
      description="Subscribe to your timetable or import an .ics file. Everything from a source stays read-only."
      className="max-w-[520px]"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <form onSubmit={(event) => void handleSubscribe(event)} className="flex flex-col gap-2">
        <label htmlFor={urlId} className="text-[12px] font-medium text-secondary">
          Subscribe to a link
        </label>
        <div className="flex items-center gap-2">
          <input
            id={urlId}
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://campus.example.edu/timetable.ics"
            className={FIELD}
          />
          <Button variant="primary" size="sm" type="submit" disabled={busy} className="flex-none">
            {busy ? 'Checking…' : 'Subscribe'}
          </Button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {isDesktopRuntime()
            ? 'The desktop app fetches the feed itself, so university links that block browsers still work.'
            : 'In a browser tab only feeds that allow cross-origin requests will load. The desktop app fetches them itself.'}
        </p>
      </form>

      <div className="mt-4 border-t border-line-soft pt-4">
        <label htmlFor={fileId} className="text-[12px] font-medium text-secondary">
          Import a file
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id={fileId}
            type="file"
            accept=".ics,text/calendar"
            onChange={(event) => void handleFile(event)}
            className={cn(
              'text-[12px] text-secondary',
              'file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line',
              'file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-secondary',
              'hover:file:border-line-strong hover:file:text-primary',
            )}
          />
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-coral/40 bg-coral-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
        >
          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none text-coral" />
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-green/40 bg-green-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
        >
          <CircleCheck size={14} aria-hidden className="mt-0.5 flex-none text-green" />
          {notice}
        </p>
      ) : null}

      <div className="mt-5 border-t border-line-soft pt-4">
        <h3 className="text-[12px] font-medium text-secondary">
          On this calendar ({sources.length})
        </h3>

        <ul className="mt-2.5 flex flex-col gap-2">
          {sources.map((source) => (
            <li key={source.id}>
              <SourceRow
                icon={
                  source.kind === 'link' ? (
                    <Globe size={14} strokeWidth={1.8} aria-hidden />
                  ) : (
                    <FileUp size={14} strokeWidth={1.8} aria-hidden />
                  )
                }
                name={source.name}
                detail={describeSource(source)}
                warning={source.error}
                actions={
                  <>
                    {source.kind === 'link' ? (
                      <IconButton
                        label={`Refresh ${source.name}`}
                        size="sm"
                        disabled={syncingIds.includes(source.id)}
                        onClick={() => void refresh(source.id)}
                      >
                        <RefreshCw
                          size={14}
                          aria-hidden
                          className={cn(syncingIds.includes(source.id) && 'animate-spin')}
                        />
                      </IconButton>
                    ) : null}
                    <IconButton
                      label={`Remove ${source.name}`}
                      size="sm"
                      onClick={() => remove(source.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </IconButton>
                  </>
                }
              />
            </li>
          ))}
        </ul>

        {sources.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
            <Link2 size={13} aria-hidden className="mt-0.5 flex-none" />
            Most universities publish a timetable feed from the campus portal. Paste that link above
            and it refreshes itself.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function describeSource(source: CalendarSource): string {
  const where = source.kind === 'link' ? describeIcsHost(source.url ?? '') : 'Imported file';
  const when = source.lastSyncedAt
    ? formatTimeAgo(new Date(source.lastSyncedAt), new Date())
    : 'never';
  return `${source.events.length} entries · ${where} · synced ${when}`;
}

interface SourceRowProps {
  icon: ReactNode;
  name: string;
  detail: string;
  warning?: string | null;
  actions: ReactNode;
}

function SourceRow({ icon, name, detail, warning, actions }: SourceRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-secondary px-3 py-2.5">
      <span className="flex-none text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-primary">{name}</p>
        <p className="truncate text-[11px] text-muted">{detail}</p>
        {warning ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-coral">
            <TriangleAlert size={11} aria-hidden className="flex-none" />
            <span className="truncate">{warning}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-0.5">{actions}</div>
    </div>
  );
}
