import { PanelLeftOpen } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { CourseSync } from '@/features/courses/components/CourseSync';
import { ReminderService } from '@/features/reminders/components/ReminderService';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { Sidebar } from './Sidebar';

/**
 * The shell. When a page takes over the window (`immersive`), the sidebar and
 * header step aside, so the page runs edge to edge.
 *
 * The tree keeps its shape either way — the absent parts leave empty slots
 * rather than a different structure. Otherwise React would remount the page
 * on switching, the page would switch back on unmounting, and the two would
 * loop.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const immersive = useUiStore((state) => state.immersive);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const documents = pathname === '/documents';

  return (
    <div
      className={cn(
        'relative flex h-full w-full overflow-hidden',
        immersive ? 'bg-surface' : 'app-shell',
      )}
      data-macos-desktop={isDesktopRuntime() && navigator.platform.startsWith('Mac')}
    >
      <ReminderService />
      <CourseSync />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Skip to content
      </a>
      <div className={cn('flex min-w-0 flex-1 overflow-hidden', !immersive && 'app-frame')}>
        {immersive ? null : <Sidebar />}
        <div
          className={cn(
            'relative flex min-w-0 flex-1 flex-col overflow-hidden',
            !immersive && 'workspace',
          )}
        >
          {immersive || documents ? null : <Header />}
          {documents && collapsed && !immersive ? (
            <IconButton
              label="Expand sidebar"
              className="absolute left-2 top-2 z-40 bg-surface"
              onClick={toggleSidebar}
            >
              <PanelLeftOpen size={16} />
            </IconButton>
          ) : null}
          <MainContent />
        </div>
      </div>
    </div>
  );
}
