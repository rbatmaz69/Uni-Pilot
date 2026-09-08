import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AccentTone } from '@/types';
import { TONE_SURFACE } from '@/lib/tone';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: AccentTone;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  tone = 'accent',
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-4">
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              'grid h-12 w-12 flex-none place-items-center rounded-[16px_16px_16px_6px]',
              TONE_SURFACE[tone],
            )}
          >
            <Icon size={22} strokeWidth={1.75} />
          </span>
        ) : null}

        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-primary">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13.5px] text-secondary">{subtitle}</p> : null}
        </div>
      </div>

      {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
    </div>
  );
}
