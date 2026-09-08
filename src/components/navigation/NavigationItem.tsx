import { NavLink } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

interface NavigationItemProps {
  item: NavItem;
  collapsed: boolean;
}

export function NavigationItem({ item, collapsed }: NavigationItemProps) {
  const Icon = item.icon;

  return (
    <Tooltip label={item.label} disabled={!collapsed} className="w-full">
      <NavLink
        to={item.path}
        className={({ isActive }) =>
          cn(
            'group relative flex h-[34px] w-full items-center rounded-md outline-offset-2',
            'transition-[background-color,color] duration-150',
            collapsed ? 'justify-center px-0' : 'gap-3 pl-3 pr-2.5',
            isActive
              ? 'bg-sidebar-active font-semibold text-sidebar-foreground'
              : 'font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && !collapsed ? (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent"
              />
            ) : null}

            <Icon
              size={19}
              strokeWidth={isActive ? 2.2 : 1.75}
              className="flex-none transition-transform duration-150 group-hover:scale-[1.06]"
              aria-hidden
            />

            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate text-left text-[13.5px]">{item.label}</span>
            ) : null}
          </>
        )}
      </NavLink>
    </Tooltip>
  );
}
