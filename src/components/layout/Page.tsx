import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

interface PageProps {
  item: NavItem;
  children?: ReactNode;
  hideHeader?: boolean;
}

/**
 * Shared page frame. Title and subtitle come from the navigation config so the
 * sidebar, header and page can never drift apart.
 */
export function Page({ item, children, hideHeader = false }: PageProps) {
  return (
    <div className={cn('flex flex-1 flex-col', !hideHeader && 'gap-7')}>
      {!hideHeader ? (
        <PageHeader title={item.label} subtitle={item.subtitle} icon={item.icon} tone={item.tone} />
      ) : null}
      {children ?? <PagePlaceholder>{item.placeholder}</PagePlaceholder>}
    </div>
  );
}

function PagePlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[370px] flex-col items-center justify-center rounded-2xl border border-line-soft bg-surface-secondary/50 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-soft">
        <Sparkles size={24} strokeWidth={1.4} />
      </span>
      <span className="mt-6 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
        Coming together
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        A little space for what&apos;s next.
      </h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-secondary">{children}</p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>
    </div>
  );
}
