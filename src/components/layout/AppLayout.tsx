import { Header } from './Header';
import { MainContent } from './MainContent';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-full w-full gap-3 overflow-hidden p-3">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:shadow-raised"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Header />
        <MainContent />
      </div>
    </div>
  );
}
