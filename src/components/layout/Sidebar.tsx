import { PanelLeftClose } from 'lucide-react';
import { NavigationItem, NavigationSection } from '@/components/navigation';
import { IconButton, Tooltip } from '@/components/ui';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { AppLogo } from './AppLogo';

const USER = {
  name: 'Lena Brandner',
  detail: 'Computer Science · 4th sem.',
  initials: 'LB',
};

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside
      aria-label="Main navigation"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-2xl bg-sidebar shadow-sidebar',
        'transition-[width] duration-250 ease-shell',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 pb-4 pt-5',
          collapsed && 'justify-center px-0',
        )}
      >
        <AppLogo />

        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-sidebar-foreground">
                Uni Pilot
              </div>
              <div className="truncate text-[11.5px] leading-tight text-sidebar-muted">
                Hochschule Wesertal
              </div>
            </div>
            <IconButton
              label="Collapse sidebar"
              surface="sidebar"
              size="sm"
              onClick={toggleSidebar}
            >
              <PanelLeftClose size={17} strokeWidth={1.8} aria-hidden />
            </IconButton>
          </>
        ) : null}
      </div>

      <nav
        aria-label="Sections"
        className={cn('scroll-area-dark min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2', collapsed ? 'px-3.5' : 'px-3')}
      >
        {NAV_SECTIONS.map((section) => (
          <NavigationSection key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>

      <div className={cn('border-t border-sidebar-border pt-3', collapsed ? 'px-3.5' : 'px-3')}>
        <NavigationItem item={NAV_ITEMS.settings} collapsed={collapsed} />

        <Tooltip label={USER.name} disabled={!collapsed} className="w-full">
          <button
            type="button"
            aria-label={`Open profile for ${USER.name}`}
            className={cn(
              'my-1.5 flex w-full items-center rounded-md py-1.5 transition-colors duration-150 hover:bg-sidebar-hover',
              collapsed ? 'justify-center px-0' : 'gap-3 px-2',
            )}
          >
            <span
              aria-hidden
              className="grid h-8 w-8 flex-none place-items-center rounded-full bg-sidebar-elevated text-[12px] font-semibold text-sidebar-foreground ring-1 ring-sidebar-border"
            >
              {USER.initials}
            </span>

            {!collapsed ? (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
                  {USER.name}
                </span>
                <span className="block truncate text-[11.5px] text-sidebar-muted">
                  {USER.detail}
                </span>
              </span>
            ) : null}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
