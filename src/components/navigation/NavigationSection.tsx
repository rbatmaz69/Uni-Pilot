import { NavigationItem } from './NavigationItem';
import type { NavSection } from '@/types';

export function NavigationSection({
  section,
  collapsed,
}: {
  section: NavSection;
  collapsed: boolean;
}) {
  const labelId = `nav-section-${section.id}`;
  return (
    <div className="mb-3 last:mb-1" role="group" aria-labelledby={labelId}>
      <div
        id={labelId}
        className={
          collapsed
            ? 'sr-only'
            : 'sidebar-section-label px-3.5 pb-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-sidebar-muted/85'
        }
      >
        {section.label}
      </div>
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <li key={item.path}>
            <NavigationItem item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  );
}
