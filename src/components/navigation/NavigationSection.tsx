import type { KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, EyeOff, SlidersHorizontal } from 'lucide-react';
import type { MenuEntry } from '@/components/ui';
import { neighbourTarget, sidebarDragType } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import type { NavItem, NavSection } from '@/types';
import { NavigationItem } from './NavigationItem';
import { SectionHeader } from './SectionHeader';
import type { OpenSidebarMenu } from './sidebarRow';
import { useSortableList } from './useSortableList';

interface NavigationSectionProps {
  /** Already arranged: the student's order, hidden entries left out. */
  section: NavSection;
  collapsed: boolean;
  /** Per-path overrides of route matching, see `NavigationItem.active`. */
  activeOverrides?: Readonly<Record<string, boolean>>;
  onMenu: OpenSidebarMenu;
  onCustomize: () => void;
}

export function NavigationSection({
  section,
  collapsed,
  activeOverrides = {},
  onMenu,
  onCustomize,
}: NavigationSectionProps) {
  const labelId = `nav-section-${section.id}`;
  const folded = useSidebarStore((state) => state.collapsedSections.includes(section.id));
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const moveNavItem = useSidebarStore((state) => state.moveNavItem);
  const setNavItemHidden = useSidebarStore((state) => state.setNavItemHidden);
  const type = sidebarDragType(section.id);
  const paths = section.items.map((item) => item.path);
  const sortable = useSortableList({
    type,
    keys: paths,
    onDrop: (transfer, before) => {
      const path = transfer.getData(type);
      if (paths.includes(path)) moveNavItem(section.id, path, before);
    },
  });
  const customize: MenuEntry = {
    label: 'Customize sidebar…',
    icon: SlidersHorizontal,
    onSelect: onCustomize,
  };

  function step(item: NavItem, direction: 'up' | 'down') {
    const before = neighbourTarget(paths, item.path, direction);
    if (before !== undefined) moveNavItem(section.id, item.path, before);
    return before !== undefined;
  }

  function stepByKey(event: KeyboardEvent<HTMLAnchorElement>, item: NavItem) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const link = event.currentTarget;
    // React moves the row's node; keep the keyboard on it.
    if (step(item, event.key === 'ArrowUp' ? 'up' : 'down'))
      requestAnimationFrame(() => link.focus());
  }

  // In the icon-only sidebar a folded section could not be unfolded again.
  const open = collapsed || !folded;

  return (
    <div className="mb-3 last:mb-1" role="group" aria-labelledby={labelId}>
      <SectionHeader
        id={labelId}
        label={section.label}
        collapsed={collapsed}
        folded={folded}
        onToggle={() => toggleSection(section.id)}
        onContextMenu={(event) => onMenu(event, section.label, [customize])}
      />
      {open && (
        <ul className="sidebar-sortable mt-0.5 space-y-px" {...sortable.list}>
          {section.items.map((item, index) => (
            <li key={item.path} {...sortable.row(item.path, index)}>
              <NavigationItem
                item={item}
                collapsed={collapsed}
                active={activeOverrides[item.path]}
                onKeyDown={(event) => stepByKey(event, item)}
                onContextMenu={(event) =>
                  onMenu(event, item.label, [
                    {
                      label: 'Move up',
                      icon: ArrowUp,
                      shortcut: '⌥↑',
                      disabled: index === 0,
                      onSelect: () => step(item, 'up'),
                    },
                    {
                      label: 'Move down',
                      icon: ArrowDown,
                      shortcut: '⌥↓',
                      disabled: index === section.items.length - 1,
                      onSelect: () => step(item, 'down'),
                    },
                    'separator',
                    {
                      label: 'Hide from sidebar',
                      icon: EyeOff,
                      onSelect: () => setNavItemHidden(item.path, true),
                    },
                    'separator',
                    customize,
                  ])
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
