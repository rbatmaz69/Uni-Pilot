import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Globe,
  House,
  LogOut,
  School,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui';
import { IliasDownloadStatus } from '@/features/integrations/components/IliasDownloadStatus';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  goBackInIlias,
  goForwardInIlias,
  openIliasInBrowser,
  signOutOfIlias,
} from '@/features/integrations/lib/iliasBrowser';
import {
  closeIliasView,
  enterIliasMode,
  leaveIliasMode,
  navigateIlias,
  overlayIsOpen,
} from '@/features/integrations/lib/iliasView';
import { openIlias } from '@/features/integrations/lib/iliasWindow';
import {
  listenToIliasBrowser,
  refreshIliasHistory,
  useIliasBrowserStore,
} from '@/features/integrations/store/iliasBrowserStore';
import { DEFAULT_ROUTE } from '@/lib/navigation';

/** Tauri rejects a command with the Rust `Err` string itself, not an Error. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return 'That did not work.';
}

/** What the strip is drawn at; the measured height is sent, this is the fallback. */
const STRIP_HEIGHT = 48;

interface IliasStripProps {
  connection: IliasConnection;
  /** A deep link to open — from "Open in ILIAS" in the calendar. */
  initialTarget?: string | undefined;
  onDisconnect: () => void;
}

/**
 * ILIAS mode: Uni Pilot as a strip across the top of the window, ILIAS below it.
 *
 * While this is mounted, Rust shrinks the Uni Pilot webview to the strip and
 * lays ILIAS out underneath, full width — two webviews side by side, never
 * overlapping, which is what keeps the cursor from flickering between them.
 * Leaving the page gives Uni Pilot the whole window back.
 *
 * Below the strip is a quiet filler. It is only ever seen in the moment before
 * the window is laid out, or behind a dialog.
 */
export function IliasStrip({ connection, initialTarget, onDisconnect }: IliasStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const history = useIliasBrowserStore((state) => state.history);

  const report = useCallback((cause: unknown) => setError(messageOf(cause)), []);
  const stripHeight = () => stripRef.current?.getBoundingClientRect().height || STRIP_HEIGHT;

  // The deep link to arrive with. Later ones only navigate (below), so the
  // window is not taken apart and rebuilt for each.
  const arrivalTarget = useRef(initialTarget);

  useEffect(() => {
    // Listening first, so the first page load in ILIAS is not missed; the
    // history is then read once for whatever loaded before the strip was here.
    listenToIliasBrowser().catch(report);
    enterIliasMode(connection, stripHeight(), arrivalTarget.current)
      .then(refreshIliasHistory)
      .catch(report);
    return () => {
      leaveIliasMode().catch(() => undefined);
    };
  }, [connection, report]);

  useEffect(() => {
    if (initialTarget === undefined || initialTarget === arrivalTarget.current) return;
    arrivalTarget.current = initialTarget;
    navigateIlias(connection, initialTarget).catch(report);
  }, [connection, initialTarget, report]);

  // Uni Pilot is only the strip, so a dialog would be cut off at its edge.
  // While one is open, Uni Pilot takes the window back; afterwards ILIAS
  // returns on the page it was on.
  useEffect(() => {
    let covered = false;
    const sync = () => {
      const open = overlayIsOpen();
      if (open === covered) return;
      covered = open;
      if (open) leaveIliasMode().catch(report);
      else enterIliasMode(connection, stripHeight()).catch(report);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'role', 'aria-modal'],
    });
    return () => observer.disconnect();
  }, [connection, report]);

  const back = () => {
    // React Router numbers the entries it pushed; 0 means ILIAS was the first
    // page opened, and there is nothing to go back to.
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    void (index > 0 ? navigate(-1) : navigate(DEFAULT_ROUTE));
  };

  const travel = (step: () => Promise<void>) => {
    setError(null);
    step().catch(report);
  };

  const signOut = () => {
    setError(null);
    setNotice(null);
    signOutOfIlias(connection)
      .then((result) => {
        if (result === 'here') setNotice('No one was signed in to ILIAS.');
      })
      .catch(report);
  };

  const go = (target: string) => {
    setError(null);
    setNotice(null);
    navigateIlias(connection, target).catch(report);
  };

  const disconnect = () => {
    closeIliasView()
      .catch(() => undefined)
      .finally(onDisconnect);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={stripRef}
        className="flex h-12 flex-none items-center gap-3 border-b border-line-soft bg-surface px-3"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={back}
          leadingIcon={<ArrowLeft size={14} aria-hidden />}
        >
          Uni Pilot
        </Button>

        <div className="flex flex-none items-center gap-0.5 border-l border-line-soft pl-2">
          <IconButton
            label="Back in ILIAS"
            size="sm"
            disabled={!history.canGoBack}
            onClick={() => travel(goBackInIlias)}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton
            label="Forward in ILIAS"
            size="sm"
            disabled={!history.canGoForward}
            onClick={() => travel(goForwardInIlias)}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-line-soft pl-3">
          <School size={15} className="flex-none text-accent" aria-hidden />
          <h1
            aria-label={`ILIAS: ${connection.name}`}
            className="truncate text-[13px] font-semibold"
          >
            {connection.name}
          </h1>
          {connection.version ? (
            <span className="flex-none text-[12px] text-muted">ILIAS {connection.version}</span>
          ) : null}
          {error ? (
            <span
              role="alert"
              title={error}
              className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-coral"
            >
              <TriangleAlert size={13} aria-hidden className="flex-none" />
              <span className="truncate">{error}</span>
            </span>
          ) : null}
          {notice && !error ? (
            <span role="status" className="truncate text-[12px] text-muted">
              {notice}
            </span>
          ) : null}
        </div>

        <IliasDownloadStatus onError={report} />

        <div className="flex flex-none items-center gap-1">
          <IconButton label="ILIAS dashboard" size="sm" onClick={() => go('')}>
            <House size={15} />
          </IconButton>
          <IconButton
            label="Open in your browser"
            size="sm"
            onClick={() => {
              openIliasInBrowser(connection).catch(report);
            }}
          >
            <Globe size={15} />
          </IconButton>
          <IconButton
            label="Open in a separate window"
            size="sm"
            onClick={() => {
              openIlias(connection).catch(report);
            }}
          >
            <AppWindow size={15} />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            leadingIcon={<LogOut size={13} aria-hidden />}
          >
            Sign out of ILIAS
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={disconnect}
            title="Only makes Uni Pilot forget this ILIAS. Sign out of ILIAS first to end your session there."
            leadingIcon={<Unplug size={13} aria-hidden />}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center bg-surface-secondary">
        <School size={28} strokeWidth={1.4} className="text-muted" aria-hidden />
      </div>
    </div>
  );
}
