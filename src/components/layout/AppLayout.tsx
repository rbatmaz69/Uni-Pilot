import { ReminderService } from '@/features/reminders/components/ReminderService';
import { FocusService } from '@/features/focus/components/FocusService';
import { FocusMediaProvider } from '@/features/focus/components/FocusMediaProvider';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { Sidebar } from './Sidebar';

/**
 * The shell. When a page takes over the window (`immersive`), the sidebar and
 * header step aside and the frame loses its padding and rounding, so the page
 * runs edge to edge.
 *
 * The tree keeps its shape either way — the absent parts leave empty slots. Otherwise
 * React would remount the page on switching, the page would switch back on unmounting,
 * and the two would loop.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const focusMode = useFocusStore((state) => state.focusMode) && pathname === NAV_ITEMS.focus.path;
  const immersive = useUiStore((state) => state.immersive) || focusMode;

  return (
    <FocusMediaProvider>
      <div
        className={cn(
          'relative flex h-full w-full overflow-hidden',
          immersive ? 'bg-surface' : 'app-shell',
        )}
      >
        <ReminderService />
        <FocusService />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
        >
          Skip to content
        </a>
        <div
          className={cn(
            'flex min-w-0 flex-1 overflow-hidden',
            !immersive && 'app-frame rounded-[30px] max-[700px]:rounded-none',
          )}
        >
          {immersive ? null : <Sidebar />}
          <div
            className={cn(
              'relative flex min-w-0 flex-1 flex-col overflow-hidden',
              !immersive && 'workspace rounded-[26px]',
            )}
          >
            {immersive ? null : <Header />}
            <MainContent />
          </div>
        </div>
      </div>
    </FocusMediaProvider>
  );
}
