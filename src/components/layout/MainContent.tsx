import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { NAV_ITEMS } from '@/lib/navigation';
import { FocusMediaPlayer } from '@/features/focus/components/FocusMediaPlayer';

/**
 * Routes that own the whole window instead of sitting in the reading column.
 * The calendar's right panel is drawn to run off the edge of the screen, so a
 * centred column would strand it in the middle of a wide monitor.
 */
const FULL_BLEED_PATHS = new Set(['/calendar']);

export function MainContent() {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED_PATHS.has(pathname);
  const immersive = useUiStore((state) => state.immersive);
  const isFocus = pathname === NAV_ITEMS.focus.path;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        'scroll-area relative min-h-0 flex-1',
        immersive || isFocus ? 'overflow-hidden' : 'overflow-y-auto',
      )}
    >
      <div
        key={pathname}
        className={cn(
          'relative z-10 mx-auto flex w-full flex-col',
          // Edge to edge when immersive, and still: the page is laid out
          // against the window, and a sliding entrance would be measured
          // mid-slide.
          !immersive && 'animate-page-enter px-3.5 pb-3.5 sm:px-5 xl:px-6',
          // `h-full` rather than `min-h-full`: full-bleed pages and Focus size
          // their panes against the window, which needs a bounded column.
          immersive
            ? 'h-full max-w-none'
            : fullBleed
              ? 'h-full max-w-none pt-1'
              : isFocus
                ? 'h-full min-h-0 pt-3.5'
                : 'min-h-full max-w-[1600px] pt-3.5',
        )}
      >
        <Outlet />
      </div>
      <FocusMediaPlayer visible={isFocus} />
    </main>
  );
}
