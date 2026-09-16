import { Bus } from 'lucide-react';
import { BUS_INFO } from '@/features/dashboard/lib/mockData';

export function PublicTransitWidget() {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground border border-sidebar-border/50 transition-all duration-200">
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-sidebar-elevated text-sidebar-foreground ring-1 ring-sidebar-border">
              <Bus size={17} strokeWidth={1.9} aria-hidden />
            </span>

            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight text-sidebar-foreground">
                {BUS_INFO.line}
              </h2>
              <p className="text-[11.5px] text-sidebar-muted">to {BUS_INFO.destination}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="font-mono text-[30px] font-semibold leading-none tracking-tight text-sidebar-foreground">
              {BUS_INFO.minutes}&apos;
            </span>
            <span className="block text-[10.5px] uppercase tracking-wider text-sidebar-muted">
              departs
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11.5px] text-sidebar-muted">
          <span>
            {BUS_INFO.stop} ·{' '}
            <span className="text-sidebar-foreground/80">{BUS_INFO.upcoming}</span>
          </span>
          <span className="font-medium text-sidebar-foreground/80">{BUS_INFO.rideDuration}</span>
        </div>
      </div>

      {/* Decorative road wave vector */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-2 -right-4 h-16 w-36 text-sidebar-elevated opacity-60"
        viewBox="0 0 160 60"
        fill="currentColor"
      >
        <path d="M0 45 Q 40 20, 80 40 T 160 30 L 160 60 L 0 60 Z" />
      </svg>
    </div>
  );
}
