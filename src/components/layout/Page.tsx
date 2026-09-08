import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';
import type { NavItem } from '@/types';

interface PageProps {
  item: NavItem;
  children?: ReactNode;
}

/**
 * Shared page frame. Title and subtitle come from the navigation config so the
 * sidebar, header and page can never drift apart.
 */
export function Page({ item, children }: PageProps) {
  return (
    <div className="flex flex-col gap-6 px-2">
      <PageHeader title={item.label} subtitle={item.subtitle} icon={item.icon} tone={item.tone} />
      {children ?? <PagePlaceholder>{item.placeholder}</PagePlaceholder>}
    </div>
  );
}

function PagePlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-16">
      <p className="max-w-sm text-center text-[13.5px] text-muted">{children}</p>
    </div>
  );
}
