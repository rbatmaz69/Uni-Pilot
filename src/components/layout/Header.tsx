import { useCallback, useRef, useState } from 'react';
import { Bell, ChevronRight, Moon, PanelLeftOpen, Search, Sun, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { useCurrentNavItem } from '@/hooks/useCurrentNavItem';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useUiStore } from '@/store/uiStore';
import { NAV_ITEMS } from '@/lib/navigation';
import { ReminderHistoryPanel } from '@/features/reminders/components/ReminderHistoryPanel';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { SearchTrigger } from './SearchTrigger';

export function Header() {
  const unread = useReminderStore((state) => state.history.some((item) => !item.dismissed));
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const currentItem = useCurrentNavItem();
  const searchRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<'search' | 'notifications'>('search');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  useKeyboardShortcut({ key: 'k', meta: true }, focusSearch);

  const openPanel = (next: typeof panel) => {
    setPanel(next);
    setQuery('');
    dialogRef.current?.showModal();
  };

  return (
    <header className="flex h-[74px] flex-none items-center justify-between gap-3 px-5 sm:px-7 xl:px-9">
      <div className="flex min-w-0 items-center gap-2.5">
        {collapsed && (
          <IconButton label="Expand sidebar" size="sm" onClick={toggleSidebar}>
            <PanelLeftOpen size={18} strokeWidth={1.7} aria-hidden />
          </IconButton>
        )}
        <span className="hidden text-[12px] text-muted xl:block">My workspace</span>
        <ChevronRight size={13} className="hidden text-muted/60 xl:block" aria-hidden />
        <span className="truncate text-[13px] font-medium text-primary">
          {currentItem?.label ?? 'Uni Pilot'}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-9 sm:w-[230px]">
          <SearchTrigger ref={searchRef} onClick={() => openPanel('search')} />
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
        <IconButton label="Toggle color theme" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? (
            <Sun size={18} strokeWidth={1.7} aria-hidden />
          ) : (
            <Moon size={18} strokeWidth={1.7} aria-hidden />
          )}
        </IconButton>
        <IconButton label="Notifications" size="sm" onClick={() => openPanel('notifications')}>
          <Bell size={18} strokeWidth={1.7} aria-hidden />
          {unread && (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-surface"
            />
          )}
        </IconButton>
        <button
          type="button"
          aria-label="Account menu"
          onClick={() => {
            void navigate('/settings');
          }}
          className="hidden h-8 w-8 flex-none place-items-center rounded-full bg-[#e5ede9] text-[10px] font-semibold text-[#4e7268] sm:grid"
        >
          AM
        </button>
      </div>
      {createPortal(
        <dialog
          ref={dialogRef}
          aria-label={panel === 'search' ? 'Search workspace' : 'Notifications'}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialogRef.current?.close();
          }}
          className="m-auto w-[min(520px,90vw)] rounded-2xl border border-line bg-surface p-6 text-primary shadow-raised backdrop:bg-slate-950/25 backdrop:backdrop-blur-sm"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {panel === 'search' ? 'Find your next stop' : 'Notifications'}
            </h2>
            <IconButton label="Close panel" onClick={() => dialogRef.current?.close()}>
              <X size={18} />
            </IconButton>
          </div>
          {panel === 'search' ? (
            <>
              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface-secondary px-3">
                <Search size={18} className="text-muted" />
                <input
                  aria-label="Search pages"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your workspace…"
                  className="h-11 w-full bg-transparent text-sm outline-none"
                />
              </label>
              <div className="mt-3 max-h-[350px] overflow-y-auto">
                {Object.values(NAV_ITEMS)
                  .filter((item) =>
                    `${item.label} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => dialogRef.current?.close()}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent-soft hover:text-accent"
                    >
                      <item.icon size={18} strokeWidth={1.7} />
                      {item.label}
                      <ChevronRight size={14} className="ml-auto" />
                    </Link>
                  ))}
                {!Object.values(NAV_ITEMS).some((item) =>
                  `${item.label} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()),
                ) && (
                  <p className="p-4 text-sm text-muted">
                    No pages found. Try “courses” or “calendar”.
                  </p>
                )}
              </div>
            </>
          ) : (
            <ReminderHistoryPanel />
          )}
        </dialog>,
        document.body,
      )}
    </header>
  );
}
