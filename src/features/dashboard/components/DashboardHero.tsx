import { ArrowUpRight, Sparkles, Timer } from 'lucide-react';
import { Button } from '@/components/ui';

interface DashboardHeroProps {
  onStartFocus: () => void;
  onAskAi: () => void;
}

export function DashboardHero({ onStartFocus, onAskAi }: DashboardHeroProps) {
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const date = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-[0.02em] text-muted">
            {date} <span className="mx-2 text-line-strong">/</span> A fresh perspective
          </p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.045em] text-primary sm:text-[34px]">
            <span className="sr-only">Dashboard — </span>
            {greeting}, Alex <span className="text-accent">✳</span>
          </h1>
          <p className="mt-2 text-[13px] text-secondary">
            A little structure. A lot more headspace.
          </p>
          <span className="sr-only">Your university life at a glance.</span>
        </div>
        <Button
          onClick={onStartFocus}
          leadingIcon={<Timer size={16} strokeWidth={1.7} />}
          className="h-10 border-line px-4"
        >
          Start focus
        </Button>
      </div>
      <div className="welcome-card relative mt-6 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3 sm:flex sm:items-center sm:gap-4 overflow-hidden rounded-2xl px-5 py-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-surface/80 text-accent">
          <Sparkles size={21} strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-primary">Make room for your best work.</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-secondary">
            Break down an assignment, untangle a concept, or plan your next study session.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={onAskAi}
          className="col-start-2 w-fit flex-none bg-surface/80 text-accent hover:bg-surface"
        >
          <span className="hidden sm:inline">Let&apos;s ask AI</span>
          <span className="sm:hidden">Ask AI</span>
          <ArrowUpRight size={16} />
        </Button>
      </div>
    </section>
  );
}
