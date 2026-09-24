import {
  CircleCheck,
  FolderOpen,
  LoaderCircle,
  SquareArrowOutUpRight,
  TriangleAlert,
  X,
} from 'lucide-react';
import { IconButton } from '@/components/ui';
import {
  openIliasDownload,
  revealIliasDownload,
  type IliasDownload,
} from '@/features/integrations/lib/iliasBrowser';
import { useIliasBrowserStore } from '@/features/integrations/store/iliasBrowserStore';
import { cn } from '@/lib/utils';

const TONE: Record<IliasDownload['state'], string> = {
  started: 'bg-surface-secondary text-secondary',
  finished: 'bg-green-soft text-primary',
  failed: 'bg-coral-soft text-primary',
};

function describe(download: IliasDownload): string {
  switch (download.state) {
    case 'started':
      return `Downloading ${download.fileName}…`;
    case 'finished':
      return `${download.fileName} saved to Downloads`;
    case 'failed':
      return `${download.fileName} could not be downloaded`;
  }
}

function StateIcon({ state }: { state: IliasDownload['state'] }) {
  if (state === 'started') {
    return <LoaderCircle size={13} aria-hidden className="flex-none animate-spin text-muted" />;
  }
  if (state === 'finished') {
    return <CircleCheck size={13} aria-hidden className="flex-none text-green" />;
  }
  return <TriangleAlert size={13} aria-hidden className="flex-none text-coral" />;
}

interface IliasDownloadStatusProps {
  onError: (cause: unknown) => void;
}

/**
 * The latest ILIAS download, in the strip: running, saved or failed — so a
 * click on a file is never met with silence. A saved file can be opened
 * (documents and media only; Rust decides) or shown in its folder.
 */
export function IliasDownloadStatus({ onError }: IliasDownloadStatusProps) {
  const latest = useIliasBrowserStore((state) => state.downloads[0]);
  const dismiss = useIliasBrowserStore((state) => state.dismiss);

  if (!latest) return null;
  const text = describe(latest);

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-[22rem] shrink items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2',
        TONE[latest.state],
      )}
    >
      <StateIcon state={latest.state} />
      <span role="status" title={text} className="min-w-0 truncate text-[12px]">
        {text}
      </span>
      {latest.state === 'finished' && latest.openable ? (
        <IconButton
          label={`Open ${latest.fileName}`}
          size="sm"
          onClick={() => {
            openIliasDownload(latest.id).catch(onError);
          }}
        >
          <SquareArrowOutUpRight size={13} />
        </IconButton>
      ) : null}
      {latest.state === 'finished' ? (
        <IconButton
          label={`Show ${latest.fileName} in its folder`}
          size="sm"
          onClick={() => {
            revealIliasDownload(latest.id).catch(onError);
          }}
        >
          <FolderOpen size={13} />
        </IconButton>
      ) : null}
      {latest.state === 'started' ? null : (
        <IconButton label="Dismiss" size="sm" onClick={() => dismiss(latest.id)}>
          <X size={13} />
        </IconButton>
      )}
    </div>
  );
}
