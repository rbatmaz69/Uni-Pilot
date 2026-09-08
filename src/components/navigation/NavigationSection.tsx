import { NavigationItem } from './NavigationItem';
import type { NavSection } from '@/types';

interface NavigationSectionProps {
  section: NavSection;
  collapsed: boolean;
}

export function NavigationSection({ section, collapsed }: NavigationSectionProps) {
  const labelId = `nav-section-${section.id}`;

  return (
    <div className="mb-3 last:mb-0" role="group" aria-labelledby={labelId}>
      {collapsed ? (
        <>
          <span id={labelId} className="sr-only">
            {section.label}
          </span>
          <div aria-hidden className="mx-3 mb-2 h-px bg-sidebar-border" />
        </>
      ) : (
        <div
          id={labelId}
          className="px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted"
        >
          {section.label}
        </div>
      )}

      <ul className="space-y-px">
        {section.items.map((item) => (
          <li key={item.path}>
            <NavigationItem item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  );
}
