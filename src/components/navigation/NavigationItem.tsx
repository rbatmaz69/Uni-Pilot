import type { AnchorHTMLAttributes } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import type { NavItem } from '@/types';
import { SIDEBAR_ICON, sidebarIconClass, sidebarRowClass } from './sidebarRow';

interface NavigationItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  item: NavItem;
  collapsed: boolean;
  /** Overrides route matching, e.g. while a favorite inside this page is the current place. */
  active?: boolean | undefined;
}

export function NavigationItem({ item, collapsed, active, ...props }: NavigationItemProps) {
  const match = useMatch({ path: item.path, end: false });
  const current = active ?? Boolean(match);
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} disabled={!collapsed} className="w-full">
      <Link
        {...props}
        to={item.path}
        aria-label={item.label}
        aria-current={current ? 'page' : undefined}
        className={sidebarRowClass(current, collapsed)}
      >
        <Icon {...SIDEBAR_ICON} className={sidebarIconClass(current)} aria-hidden />
        {!collapsed && <span className="sidebar-label min-w-0 flex-1 truncate">{item.label}</span>}
      </Link>
    </Tooltip>
  );
}
