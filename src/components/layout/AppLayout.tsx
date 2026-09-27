import { PanelLeftOpen } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { IconButton } from '@/components/ui';
import { useUiStore } from '@/store/uiStore';
import { useLocation } from 'react-router-dom';
import { ReminderService } from '@/features/reminders/components/ReminderService';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const { pathname } = useLocation();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  return (
    <div
      className="app-shell relative flex h-full w-full overflow-hidden"
      data-macos-desktop={isTauri() && navigator.platform.startsWith('Mac')}
    >
      <ReminderService />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Skip to content
      </a>
      <div className="app-frame flex min-w-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="workspace relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {pathname !== '/documents' && <Header />}
          {pathname === '/documents' && collapsed && (
            <IconButton
              label="Expand sidebar"
              className="absolute left-2 top-2 z-40 bg-surface"
              onClick={toggleSidebar}
            >
              <PanelLeftOpen size={16} />
            </IconButton>
          )}
          <MainContent />
        </div>
      </div>
    </div>
  );
}
