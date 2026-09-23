import { useCallback, useEffect, useRef, useState } from 'react';
import { AppWindow, House, LogOut, School, TriangleAlert, Unplug } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { openIlias } from '@/features/integrations/lib/iliasWindow';
import {
  boundsOf,
  closeIliasView,
  hideIliasView,
  overlayIsOpen,
  placeIliasView,
  showIliasView,
} from '@/features/integrations/lib/iliasView';

/** Tauri rejects a command with the Rust `Err` string itself, not an Error. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return 'That did not work.';
}

interface EmbeddedIliasProps {
  connection: IliasConnection;
  /** A deep link to open on arrival — from "Open in ILIAS" in the calendar. */
  initialTarget?: string | undefined;
  onDisconnect: () => void;
}

/**
 * ILIAS inside the Uni Pilot window, with a slim bar of our own above it.
 *
 * The grey area below the bar is a placeholder: the real ILIAS is a native
 * webview Rust lays exactly over it. This component keeps the two aligned —
 * reporting where the area is whenever it moves or resizes — and asks Rust to
 * step ILIAS aside while a dialog is open, since a native view would otherwise
 * cover it.
 */
export function EmbeddedIlias({ connection, initialTarget, onDisconnect }: EmbeddedIliasProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useCallback((cause: unknown) => setError(messageOf(cause)), []);

  /**
   * Shows ILIAS over the area, navigating only when given a target. After the
   * view exists, the bounds are sent once more: the first show can take long
   * enough for the layout to have moved in the meantime.
   */
  const go = useCallback(
    (target?: string) => {
      const area = areaRef.current;
      if (!area) return;
      setError(null);
      showIliasView(connection, boundsOf(area), target)
        .then(() => placeIliasView(boundsOf(area)))
        .catch(report);
    },
    [connection, report],
  );

  // Arrive, and step aside when leaving the page. Hidden rather than closed,
  // so coming back finds ILIAS where the student left it.
  useEffect(() => {
    go(initialTarget);
    return () => {
      hideIliasView().catch(() => undefined);
    };
  }, [go, initialTarget]);

  // Follow the area: window resizes, the sidebar collapsing, anything else
  // that moves it. One placement per frame at most.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        placeIliasView(boundsOf(area)).catch(report);
      });
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow);
    observer?.observe(area);
    window.addEventListener('resize', follow);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', follow);
      cancelAnimationFrame(frame);
    };
  }, [report]);

  // Step aside for dialogs, which would otherwise open underneath ILIAS.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    let covered = false;
    const sync = () => {
      const open = overlayIsOpen();
      if (open === covered) return;
      covered = open;
      if (open) hideIliasView().catch(report);
      // No target: come back on the same page.
      else showIliasView(connection, boundsOf(area)).catch(report);
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

  const disconnect = () => {
    closeIliasView()
      .catch(() => undefined)
      .finally(onDisconnect);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <School size={16} className="flex-none text-accent" aria-hidden />
          <h2 className="truncate text-sm font-semibold">{connection.name}</h2>
          {connection.version ? (
            <span className="flex-none text-[12px] text-muted">ILIAS {connection.version}</span>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-1">
          <IconButton label="ILIAS dashboard" size="sm" onClick={() => go('')}>
            <House size={15} />
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
            onClick={() => go(`${connection.baseUrl}/logout.php`)}
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

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
        >
          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none text-coral" />
          {error}
        </p>
      ) : null}

      {/*
        Square on purpose: the native view is a plain rectangle laid over this,
        and a rounded frame would show its corners around it.
      */}
      <div
        ref={areaRef}
        aria-label="ILIAS"
        role="region"
        className="grid min-h-0 flex-1 place-items-center border-t border-line-soft bg-surface-secondary"
      >
        <p className="max-w-xs text-center text-[12px] leading-relaxed text-muted">
          ILIAS appears here. It is a browser: Uni Pilot does not read what you type into it.
        </p>
      </div>
    </div>
  );
}
