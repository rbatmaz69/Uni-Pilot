import { ReminderService } from '@/features/reminders/components/ReminderService';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="app-shell relative flex h-full w-full overflow-hidden">
      <ReminderService />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Skip to content
      </a>
      <div className="app-frame flex min-w-0 flex-1 overflow-hidden rounded-[30px] max-[700px]:rounded-none">
        <Sidebar />
        <div className="workspace relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[26px]">
          <Header />
          <MainContent />
        </div>
      </div>
    </div>
  );
}
