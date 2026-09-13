import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/navigation';

export function MainContent() {
  const { pathname } = useLocation();
  const isFocus = pathname === NAV_ITEMS.focus.path;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn('scroll-area min-h-0 flex-1', isFocus ? 'overflow-hidden' : 'overflow-y-auto')}
    >
      <div
        key={pathname}
        className={cn(
          'animate-page-enter mx-auto flex w-full flex-col px-3.5 sm:px-5 xl:px-6 pb-3.5',
          isFocus ? 'h-full min-h-0' : 'min-h-full max-w-[1600px]',
          pathname === '/calendar' ? 'pt-1' : 'pt-3.5',
        )}
      >
        <Outlet />
      </div>
    </main>
  );
}
