import type { AnchorHTMLAttributes } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import { newTabHandlers } from '@/lib/tabActions';
import type { NavItem } from '@/types';
import { SIDEBAR_ICON, sidebarIconClass, sidebarRowClass } from './sidebarRow';

interface NavigationItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  item: NavItem;
  /** Overrides route matching, e.g. while a favorite inside this page is the current place. */
  active?: boolean | undefined;
}

/**
 * One icon of the rail. Its name is the link's accessible name and shows as a tooltip.
 * ⌘-click or the middle button opens the section in a new tab.
 */
export function NavigationItem({ item, active, onClick, ...props }: NavigationItemProps) {
  const match = useMatch({ path: item.path, end: false });
  const current = active ?? Boolean(match);
  const newTab = newTabHandlers(item.path);
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} className="w-full">
      <Link
        {...props}
        onClick={(event) => {
          newTab.onClick(event);
          if (!event.defaultPrevented) onClick?.(event);
        }}
        onAuxClick={newTab.onAuxClick}
        to={item.path}
        aria-label={item.label}
        aria-current={current ? 'page' : undefined}
        className={sidebarRowClass(current)}
      >
        <Icon {...SIDEBAR_ICON} className={sidebarIconClass(current)} aria-hidden />
      </Link>
    </Tooltip>
  );
}
