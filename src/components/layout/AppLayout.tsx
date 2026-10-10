import type { CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { FaceUnlockBar, NotchSync } from '@/features/auto-sign-in';
import { CourseSync } from '@/features/courses/components/CourseSync';
import { FocusService } from '@/features/focus/components/FocusService';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { ReminderService } from '@/features/reminders/components/ReminderService';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { selectPanelShown, useUiStore } from '@/store/uiStore';
import { MainContent } from './MainContent';
import { SectionPanelHostContext, useSectionPanelSlot } from './sectionPanelHost';
import { Sidebar } from './Sidebar';
import { TabSync } from './TabSync';
import { TitleBar } from './TitleBar';

/**
 * The shell. The window is a frame (a soft gradient) with, from left to right:
 *
 * 1. the icon rail (`Sidebar`), on every page, the full height of the window;
 * 2. beside it, the title bar (`TitleBar`: Back and Forward, the tabs, search)
 *    across the top, and below it
 * 3. the panel slot, where a page that needs a sidebar of its own shows it
 *    (`SectionPanel`). Empty, it takes no room;
 * 4. the page in a card (`.workspace`). Beside a panel the card joins it;
 *    without one it floats with a gutter on the other three sides.
 *
 * In ILIAS mode (`iliasMode`) the card is ILIAS itself, a native webview the
 * window places beside this one (`src-tauri/src/ilias_view.rs`), so Uni Pilot's
 * own webview is only the left column: the rail and the ILIAS panel, kept open
 * whatever the student chose for panels. The header, the face-unlock bar and
 * the card step aside; what is left of the page is a quiet stand-in for ILIAS,
 * seen only before the window is laid out or behind a dialog. There is no room
 * for the title bar then: ILIAS is a webview of its own, and Uni Pilot's cannot
 * reach above it. Focus mode on the Focus page hides the rail, title bar and
 * panel too, but keeps the frame around the page. Documents draws its own panel
 * and card below the title bar, so there the workspace is bare and lets the
 * frame show.
 *
 * The tree keeps its shape either way — the absent parts leave empty slots
 * rather than a different structure. Otherwise React would remount the page
 * on switching, the page would switch back on unmounting, and the two would
 * loop.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const iliasMode = useUiStore((state) => state.iliasMode);
  const panelShown = useUiStore(selectPanelShown);
  const { host, slotRef } = useSectionPanelSlot();
  const documents = pathname === '/documents';
  const panelOpen = useUiStore((state) => state.panelOpen);
  const focusMode = useFocusStore((state) => state.focusMode) && pathname === NAV_ITEMS.focus.path;
  const bare = focusMode;
  const titled = !bare && !iliasMode;
  // How much of the row the panel takes, for the title bar to line its tabs up with: a
  // section's panel, or Documents' own. It glides with the panel (`--panel-span`).
  const panelSpan = titled && ((host.present && panelShown) || (documents && panelOpen));

  return (
    <SectionPanelHostContext.Provider value={host}>
      <div
        className="app-shell relative flex h-full w-full overflow-hidden"
        data-macos-desktop={isDesktopRuntime() && navigator.platform.startsWith('Mac')}
        data-ilias-mode={iliasMode || undefined}
      >
        <TabSync />
        <ReminderService />
        <CourseSync />
        <NotchSync />
        <FocusService />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
        >
          Skip to content
        </a>
        <div className="app-frame flex min-w-0 flex-1 overflow-hidden">
          {bare ? null : <Sidebar />}
          <div
            className="app-column flex min-w-0 flex-1 flex-col overflow-hidden"
            data-titlebar={titled || undefined}
            // A panel the student made wider or narrower; never more than half the window.
            style={
              {
                ...(host.width === null ? {} : { '--panel-width': `min(${host.width}px, 50vw)` }),
                '--panel-span': panelSpan ? 'var(--panel-width)' : '0px',
              } as CSSProperties
            }
          >
            {titled ? <TitleBar /> : null}
            <div className="panel-stage flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <div ref={slotRef} className="section-panel-slot" hidden={bare} />
              <div
                className={cn(
                  'relative flex min-w-0 flex-1 flex-col overflow-hidden',
                  !iliasMode && 'workspace',
                )}
                data-frame={documents ? 'none' : undefined}
                data-panel={(host.present && panelShown && !bare) || undefined}
              >
                {/* Face unlock's bar sits above everything and blocks nothing; in ILIAS
                    mode there is no room for it, so the camera stays off there. */}
                {iliasMode ? null : <FaceUnlockBar />}
                <MainContent />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionPanelHostContext.Provider>
  );
}
