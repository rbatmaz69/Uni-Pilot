import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function MainContent() {
  const { pathname } = useLocation();

  return (
    <main id="main-content" tabIndex={-1} className="scroll-area min-h-0 flex-1 overflow-y-auto">
      <div
        key={pathname}
        className={cn(
          'animate-page-enter mx-auto flex min-h-full w-full max-w-[1600px] flex-col px-3.5 sm:px-5 xl:px-6 pb-3.5',
          pathname === '/calendar' ? 'pt-1' : 'pt-3.5',
        )}
      >
        <Outlet />
      </div>
    </main>
  );
}
