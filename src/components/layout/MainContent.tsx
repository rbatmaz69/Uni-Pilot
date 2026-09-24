import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

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

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        'min-h-0 flex-1',
        immersive ? 'overflow-hidden' : 'scroll-area overflow-y-auto',
      )}
    >
      <div
        key={pathname}
        className={cn(
          'mx-auto flex w-full flex-col',
          // Edge to edge when immersive, and still: the page is laid out
          // against the window, and a sliding entrance would be measured
          // mid-slide.
          !immersive && 'animate-page-enter px-3.5 pb-3.5 sm:px-5 xl:px-6',
          // `h-full` rather than `min-h-full`: a full-bleed page sizes its own
          // panes against the window, which it can only do from a column that
          // is the window rather than one free to grow past it.
          immersive
            ? 'h-full max-w-none'
            : fullBleed
              ? 'h-full max-w-none pt-1'
              : 'min-h-full max-w-[1600px] pt-3.5',
        )}
      >
        <Outlet />
      </div>
    </main>
  );
}
