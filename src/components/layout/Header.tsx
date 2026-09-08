import { useCallback, useRef } from 'react';
import { Bell, PanelLeftOpen, Plus } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { useCurrentNavItem } from '@/hooks/useCurrentNavItem';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useUiStore } from '@/store/uiStore';
import { SearchTrigger } from './SearchTrigger';

export function Header() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const currentItem = useCurrentNavItem();
  const searchRef = useRef<HTMLButtonElement>(null);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  useKeyboardShortcut({ key: 'k', meta: true }, focusSearch);

  return (
    <header className="grid h-[60px] flex-none grid-cols-[1fr_minmax(0,440px)_1fr] items-center gap-4 rounded-2xl border border-line-soft bg-surface px-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-2">
        {collapsed ? (
          <IconButton label="Expand sidebar" size="sm" onClick={toggleSidebar}>
            <PanelLeftOpen size={17} strokeWidth={1.8} aria-hidden />
          </IconButton>
        ) : null}

        <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-primary">
          {currentItem?.label ?? 'Uni Pilot'}
        </span>
      </div>

      <SearchTrigger ref={searchRef} />

      <div className="flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          leadingIcon={<Plus size={15} strokeWidth={2} aria-hidden />}
          className="hidden xl:inline-flex"
        >
          New
        </Button>

        <IconButton label="Notifications" size="sm">
          <Bell size={17} strokeWidth={1.8} aria-hidden />
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-pink ring-2 ring-surface"
          />
        </IconButton>

        <span aria-hidden className="mx-1 h-5 w-px bg-line" />

        <button
          type="button"
          aria-label="Account menu"
          className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent transition-shadow duration-150 hover:shadow-soft"
        >
          LB
        </button>
      </div>
    </header>
  );
}
