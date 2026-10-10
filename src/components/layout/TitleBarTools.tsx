import { useCallback, useRef, useState } from 'react';
import { Bell, ChevronRight, Moon, Search, Sun, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { NAV_ITEMS } from '@/lib/navigation';
import { isDarkTheme } from '@/lib/theme';
import { ReminderHistoryPanel } from '@/features/reminders/components/ReminderHistoryPanel';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { useUiStore } from '@/store/uiStore';
import { SearchTrigger } from './SearchTrigger';

/**
 * The right end of the title bar: search (⌘K), the colour theme and the
 * notifications. The search shrinks to its icon when the tabs need the room.
 */
export function TitleBarTools() {
  const unread = useReminderStore((state) => state.history.some((item) => !item.dismissed));
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const searchRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<'search' | 'notifications'>('search');
  const [query, setQuery] = useState('');
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  useKeyboardShortcut({ key: 'k', meta: true }, focusSearch);

  const openPanel = (next: typeof panel) => {
    setPanel(next);
    setQuery('');
    dialogRef.current?.showModal();
  };
  const matches = Object.values(NAV_ITEMS).filter((item) =>
    `${item.label} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="titlebar-tools" data-tauri-drag-region>
      <div className="@container/search w-9 @[900px]/titlebar:w-[210px]">
        <SearchTrigger ref={searchRef} onClick={() => openPanel('search')} />
      </div>
      <IconButton
        label="Toggle color theme"
        size="sm"
        className="titlebar-button"
        onClick={toggleTheme}
      >
        {isDarkTheme(theme) ? (
          <Sun size={17} strokeWidth={1.7} aria-hidden />
        ) : (
          <Moon size={17} strokeWidth={1.7} aria-hidden />
        )}
      </IconButton>
      <IconButton
        label="Notifications"
        size="sm"
        className="titlebar-button"
        onClick={() => openPanel('notifications')}
      >
        <Bell size={17} strokeWidth={1.7} aria-hidden />
        {unread && (
          <span
            aria-hidden
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-surface"
          />
        )}
      </IconButton>
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
                {matches.map((item) => (
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
                {matches.length === 0 && (
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
    </div>
  );
}
