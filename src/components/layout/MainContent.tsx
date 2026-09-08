import { Outlet, useLocation } from 'react-router-dom';

export function MainContent() {
  const { pathname } = useLocation();

  return (
    <main id="main-content" tabIndex={-1} className="scroll-area min-h-0 flex-1 overflow-y-auto">
      <div key={pathname} className="animate-page-enter mx-auto w-full max-w-[1600px] px-1 pb-10 pt-6">
        <Outlet />
      </div>
    </main>
  );
}
