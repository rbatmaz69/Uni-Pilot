import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Globe,
  House,
  LogOut,
  School,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import {
  PanelAction,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelItem,
  PanelSection,
} from '@/components/layout/Panel';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { iliasTarget, splitCourseTitle } from '@/features/courses/lib/courses';
import { hostOf, useCourseStore } from '@/features/courses/store/courseStore';
import { IliasDownloadStatus } from '@/features/integrations/components/IliasDownloadStatus';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  goBackInIlias,
  goForwardInIlias,
  openIliasInBrowser,
  signOutOfIlias,
} from '@/features/integrations/lib/iliasBrowser';
import {
  measureColumn,
  readFrameColour,
  readGutter,
  sameMetrics,
  type IliasMetrics,
} from '@/features/integrations/lib/iliasFrame';
import {
  closeIliasView,
  enterIliasMode,
  leaveIliasMode,
  navigateIlias,
  overlayIsOpen,
  setIliasLayout,
} from '@/features/integrations/lib/iliasView';
import { openIlias } from '@/features/integrations/lib/iliasWindow';
import {
  listenToIliasBrowser,
  refreshIliasHistory,
  useIliasBrowserStore,
} from '@/features/integrations/store/iliasBrowserStore';
import { useUiStore } from '@/store/uiStore';
import '@/features/integrations/ilias.css';

/** Tauri rejects a command with the Rust `Err` string itself, not an Error. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return 'That did not work.';
}

/**
 * What the page tells Rust about its layout, and the means to keep it current.
 *
 * The column is the panel's right edge, the gutter and the frame's colour are
 * the stylesheet's (`--frame-gutter`, `--frame-to`). `measure` reads all three
 * now, from the page as it is: the shell hands its slot over a moment after
 * this component first renders and switches to ILIAS mode (and its fixed panel
 * width) a moment after that, so a number taken earlier could be a layout
 * ago. `metrics` is the same reading kept as state, refreshed whenever the
 * panel changes size, the window changes, or the theme does — `data-theme` on
 * the document — so an effect can tell when to say it again.
 *
 * `attach` goes on an element inside the panel. `metrics` is `null` until the
 * panel is on screen.
 */
function useIliasMetrics() {
  const panel = useRef<Element | null>(null);
  const watching = useRef<ResizeObserver | null>(null);
  const [metrics, setMetrics] = useState<IliasMetrics | null>(null);

  const measure = useCallback((): IliasMetrics | null => {
    if (!panel.current) return null;
    return {
      column: measureColumn(panel.current),
      gutter: readGutter(),
      frame: readFrameColour(),
    };
  }, []);

  const refresh = useCallback(() => {
    const next = measure();
    setMetrics((known) => (known && next && sameMetrics(known, next) ? known : next));
  }, [measure]);

  const attach = useCallback(
    (node: HTMLElement | null) => {
      watching.current?.disconnect();
      watching.current = null;
      panel.current = node?.closest('aside') ?? null;
      if (panel.current && typeof ResizeObserver !== 'undefined') {
        watching.current = new ResizeObserver(refresh);
        watching.current.observe(panel.current);
      }
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    window.addEventListener('resize', refresh);
    const theme = new MutationObserver(refresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener('resize', refresh);
      theme.disconnect();
    };
  }, [refresh]);

  return { metrics, measure, attach };
}

interface IliasPanelProps {
  connection: IliasConnection;
  /** A deep link to open — from "Open in ILIAS" in the calendar. */
  initialTarget?: string | undefined;
  onDisconnect: () => void;
}

/**
 * ILIAS mode: the ILIAS panel beside the icon rail, and ILIAS itself as the card.
 *
 * While this is mounted, Rust shrinks the Uni Pilot webview to the left column
 * (rail and panel) and lays ILIAS out to its right, with the frame's gutter
 * around it — two webviews side by side, never overlapping, which is what keeps
 * the cursor from flickering between them. Leaving the page gives Uni Pilot the
 * whole window back; the rail is the way out.
 *
 * The panel carries what the strip across the top used to: back and forward and
 * the dashboard in its header, the student's courses in its body, and downloads,
 * the browser, the separate window, signing out and disconnecting in its foot.
 * It stays open whatever the student chose for panels (`selectPanelShown`): it
 * holds the only controls ILIAS has.
 *
 * Beside the panel is a quiet stand-in for ILIAS. It is only ever seen in the
 * moment before the window is laid out, or behind a dialog.
 */
export function IliasPanel({ connection, initialTarget, onDisconnect }: IliasPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const history = useIliasBrowserStore((state) => state.history);
  const location = useIliasBrowserStore((state) => state.location);
  const installation = useCourseStore((state) => state.installation);
  const read = useCourseStore((state) => state.courses);
  const iliasMode = useUiStore((state) => state.iliasMode);
  const setIliasMode = useUiStore((state) => state.setIliasMode);
  const { metrics, measure, attach } = useIliasMetrics();

  const report = useCallback((cause: unknown) => setError(messageOf(cause)), []);

  // The courses ILIAS last gave, if they are this installation's and can be opened.
  const courses = useMemo(
    () =>
      installation === hostOf(connection) && read
        ? read.items.filter((course) => course.online)
        : [],
    [connection, installation, read],
  );

  // ILIAS mode for the shell — the header, the card and the face-unlock bar step
  // aside, the panel is pinned open, the panel's width becomes a fixed one —
  // from before the first paint, and ended with the panel.
  useLayoutEffect(() => {
    setIliasMode(true);
    return () => setIliasMode(false);
  }, [setIliasMode]);

  /** What Rust was last given, or null while ILIAS mode is off. */
  const sent = useRef<IliasMetrics | null>(null);

  // The deep link to arrive with. Later ones only navigate (below), so the
  // window is not taken apart and rebuilt for each.
  const arrivalTarget = useRef(initialTarget);

  // Only once the shell is in ILIAS mode and the panel is on screen: until then
  // the column is not the column.
  const ready = iliasMode && metrics !== null;
  useEffect(() => {
    if (!ready) return;
    const layout = measure();
    if (!layout) return;
    // Listening first, so the first page load in ILIAS is not missed; the
    // history is then read once for whatever loaded before the panel was here.
    listenToIliasBrowser().catch(report);
    sent.current = layout;
    enterIliasMode(connection, layout, arrivalTarget.current)
      .then(refreshIliasHistory)
      .catch(report);
    return () => {
      sent.current = null;
      leaveIliasMode().catch(() => undefined);
    };
  }, [connection, measure, ready, report]);

  useEffect(() => {
    if (initialTarget === undefined || initialTarget === arrivalTarget.current) return;
    arrivalTarget.current = initialTarget;
    navigateIlias(connection, initialTarget).catch(report);
  }, [connection, initialTarget, report]);

  // The theme changed, say. Not through `enter`: that would be a different
  // call with a different meaning, and Rust ignores this one when ILIAS mode
  // is off, as it is behind a dialog.
  useEffect(() => {
    if (!metrics || !sent.current || sameMetrics(sent.current, metrics)) return;
    sent.current = metrics;
    setIliasLayout(metrics).catch(report);
  }, [metrics, report]);

  // Uni Pilot is only the column, so a dialog would be cut off at its edge.
  // While one is open, Uni Pilot takes the window back; afterwards ILIAS
  // returns on the page it was on.
  useEffect(() => {
    let covered = false;
    const sync = () => {
      const open = overlayIsOpen();
      if (open === covered) return;
      covered = open;
      if (open) {
        sent.current = null;
        leaveIliasMode().catch(report);
        return;
      }
      const layout = measure();
      if (!layout) return;
      sent.current = layout;
      enterIliasMode(connection, layout).catch(report);
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
  }, [connection, measure, report]);

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
    <>
      {/* Never slides: ILIAS's native view is laid out from where this panel ends. */}
      <SectionPanel label="ILIAS" motion={false}>
        <PanelHeader
          title="ILIAS"
          actions={
            <>
              <PanelAction
                label="Back in ILIAS"
                disabled={!history.canGoBack}
                onClick={() => travel(goBackInIlias)}
              >
                <ChevronLeft size={16} strokeWidth={1.8} aria-hidden />
              </PanelAction>
              <PanelAction
                label="Forward in ILIAS"
                disabled={!history.canGoForward}
                onClick={() => travel(goForwardInIlias)}
              >
                <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
              </PanelAction>
              <PanelAction label="ILIAS dashboard" onClick={() => go('')}>
                <House size={15} strokeWidth={1.8} aria-hidden />
              </PanelAction>
            </>
          }
        />
        <PanelBody>
          {/* Where the panel is measured from: any element inside it will do. */}
          <p ref={attach} className="ilias-panel-note" title={connection.name}>
            {connection.name}
            {connection.version ? ` · ILIAS ${connection.version}` : ''}
          </p>
          {error ? (
            <p role="alert" title={error} className="ilias-panel-alert">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 flex-none text-coral" />
              <span className="min-w-0">{error}</span>
            </p>
          ) : null}
          {notice && !error ? (
            <p role="status" className="ilias-panel-note">
              {notice}
            </p>
          ) : null}
          <PanelSection heading="Courses">
            {courses.map((course) => {
              const { name } = splitCourseTitle(course.title);
              return (
                <PanelItem
                  key={course.refId}
                  icon={BookOpen}
                  label={name}
                  title={course.title}
                  active={location.refId === course.refId}
                  onClick={() => go(iliasTarget(course.providerType, course.refId))}
                />
              );
            })}
            {courses.length === 0 ? (
              <p className="ilias-panel-note">
                Your courses appear here once Uni Pilot has read them from ILIAS, after you have
                signed in.
              </p>
            ) : null}
          </PanelSection>
        </PanelBody>
        <PanelFooter>
          <IliasDownloadStatus onError={report} />
          <PanelItem
            icon={Globe}
            label="Open in your browser"
            onClick={() => {
              openIliasInBrowser(connection).catch(report);
            }}
          />
          <PanelItem
            icon={AppWindow}
            label="Open in a separate window"
            onClick={() => {
              openIlias(connection).catch(report);
            }}
          />
          <PanelItem icon={LogOut} label="Sign out of ILIAS" onClick={signOut} />
          <PanelItem
            icon={Unplug}
            label="Disconnect"
            title="Only makes Uni Pilot forget this ILIAS. Sign out of ILIAS first to end your session there."
            onClick={disconnect}
          />
        </PanelFooter>
      </SectionPanel>

      <div className="ilias-stage">
        <h1 className="sr-only">{`ILIAS: ${connection.name}`}</h1>
        <School size={28} strokeWidth={1.4} aria-hidden />
      </div>
    </>
  );
}
