import { Outlet, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

/**
 * Routes that own the whole window instead of sitting in the reading column.
 * The calendar's right panel is drawn to run off the edge of the screen, so a
 * centred column would strand it in the middle of a wide monitor. The Inbox
 * scrolls its list and the open message apart, which needs a column exactly
 * as tall as the window, and so does the document explorer.
 */
const FULL_BLEED_PATHS = new Set(['/calendar', '/inbox', '/documents']);

export function MainContent() {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED_PATHS.has(pathname);
  const iliasMode = useUiStore((state) => state.iliasMode);
  // The document explorer lays out its own panes and scrolls them itself.
  const documents = pathname === '/documents';
  // The focus timer fills the window and never scrolls.
  const isFocus = pathname === NAV_ITEMS.focus.path;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        'min-h-0 flex-1',
        iliasMode || documents || isFocus ? 'overflow-hidden' : 'scroll-area overflow-y-auto',
      )}
    >
      <div
        key={pathname}
        className={cn(
          'mx-auto flex w-full flex-col',
          // Edge to edge in ILIAS mode, and still: the page is laid out
          // against the window, and a sliding entrance would be measured
          // mid-slide.
          !iliasMode && 'animate-page-enter px-3.5 pb-3.5 sm:px-5 xl:px-6',
          // `h-full` rather than `min-h-full`: a full-bleed page sizes its own
          // panes against the window, which it can only do from a column that
          // is the window rather than one free to grow past it.
          iliasMode
            ? 'h-full max-w-none'
            : documents
              ? 'h-full max-w-none !p-0'
              : isFocus
                ? 'h-full min-h-0 max-w-none pt-3.5'
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
