import { ArrowUpRight, ChevronsUpDown, Moon, PanelLeft, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NavigationItem, NavigationSection } from '@/components/navigation';
import { IconButton, Tooltip } from '@/components/ui';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { AppLogo } from './AppLogo';

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Main navigation"
      data-collapsed={collapsed}
      className={cn(
        'sidebar-glass relative flex h-full flex-none flex-col overflow-hidden p-3 transition-[width] duration-250 ease-shell',
        collapsed && 'px-2',
      )}
    >
      <div
        className={cn(
          'sidebar-brand flex h-[64px] flex-none items-center gap-2 px-3 pb-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <AppLogo />
        {!collapsed && (
          <>
            <span className="sidebar-label flex-1 whitespace-nowrap text-[22px] font-bold tracking-[-0.055em] text-accent">
              Uni Pilot
            </span>
            <IconButton
              label="Collapse sidebar"
              size="sm"
              onClick={toggleSidebar}
              className="sidebar-expanded-control text-sidebar-muted hover:bg-sidebar-hover"
            >
              <PanelLeft size={16} strokeWidth={1.7} aria-hidden />
            </IconButton>
          </>
        )}
      </div>
      <nav
        aria-label="Sections"
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {NAV_SECTIONS.map((section) => (
          <NavigationSection key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>
      {!collapsed && (
        <div className="sidebar-label semester-note mx-2 mb-4 mt-3 rounded-2xl border border-white/60 bg-surface/35 p-3.5 dark:border-white/5">
          <div className="flex items-center justify-between text-[11px] font-medium text-sidebar-muted">
            <span>Your semester</span>
            <ArrowUpRight size={14} aria-hidden />
          </div>
          <p className="mt-1.5 text-[12px] font-semibold text-sidebar-foreground">
            A little progress, every day.
          </p>
          <p className="mt-1 text-[11px] text-sidebar-muted">You&apos;ve got this, Alex.</p>
        </div>
      )}
      <div className="flex-none pt-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <NavigationItem item={NAV_ITEMS.settings} collapsed={collapsed} />
          </div>
          {!collapsed && (
            <IconButton
              label="Toggle color theme"
              size="sm"
              onClick={toggleTheme}
              className="sidebar-label text-sidebar-muted hover:bg-sidebar-hover"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
          )}
        </div>
        <Tooltip label="Alex Morgan" disabled={!collapsed} className="mt-3 w-full">
          <button
            type="button"
            aria-label="Open profile for Alex"
            onClick={() => {
              void navigate('/settings');
            }}
            className={cn(
              'sidebar-profile flex w-full items-center gap-2.5 border-t border-sidebar-border/60 px-2 py-3 text-left',
              collapsed && 'justify-center px-0',
            )}
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#c8dbd7] text-[12px] font-semibold text-[#3f6860] ring-2 ring-white/70">
              AM
            </span>
            {!collapsed && (
              <>
                <span className="sidebar-label min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-sidebar-foreground">
                    Alex Morgan
                  </span>
                  <span className="block text-[11px] text-sidebar-muted">Your personal campus</span>
                </span>
                <ChevronsUpDown
                  size={14}
                  className="sidebar-label text-sidebar-muted"
                  aria-hidden
                />
              </>
            )}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
