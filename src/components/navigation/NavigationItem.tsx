import { NavLink } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

export function NavigationItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} disabled={!collapsed} className="w-full">
      <NavLink
        to={item.path}
        aria-label={item.label}
        className={({ isActive }) =>
          cn(
            'nav-link group flex h-[37px] w-full items-center rounded-full transition-colors duration-150',
            collapsed ? 'justify-center' : 'gap-3 px-3.5',
            isActive
              ? 'bg-sidebar-active/80 font-semibold text-sidebar-foreground'
              : 'text-sidebar-muted hover:bg-sidebar-hover/65 hover:text-sidebar-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={20}
              strokeWidth={isActive ? 2 : 1.7}
              className="nav-icon flex-none"
              aria-hidden
            />
            {!collapsed && (
              <span className="sidebar-label min-w-0 flex-1 truncate text-[13.5px]">
                {item.label}
              </span>
            )}
            {!collapsed && isActive && (
              <span aria-hidden className="sidebar-label h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </>
        )}
      </NavLink>
    </Tooltip>
  );
}
