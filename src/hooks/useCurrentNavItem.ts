import { useLocation } from 'react-router-dom';
import { getNavItemByPath } from '@/lib/navigation';
import type { NavItem } from '@/types';

/** The navigation entry matching the active route, if there is one. */
export function useCurrentNavItem(): NavItem | undefined {
  const { pathname } = useLocation();
  return getNavItemByPath(pathname);
}
