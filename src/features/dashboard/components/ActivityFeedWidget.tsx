import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTIFICATIONS } from '@/features/dashboard/lib/mockData';

type FilterTab = 'All' | 'Mail' | 'ILIAS';

export function ActivityFeedWidget() {
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const filteredItems = NOTIFICATIONS.filter(
    (item) => activeTab === 'All' || item.source === activeTab,
  );
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Inbox size={18} strokeWidth={1.7} className="text-muted" />
          <h2 className="text-[16px] font-semibold tracking-tight">Campus updates</h2>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">3</span>
        </div>
        <div className="flex gap-1">
          {(['All', 'Mail', 'ILIAS'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={activeTab === filter}
              onClick={() => setActiveTab(filter)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] transition-colors',
                activeTab === filter
                  ? 'bg-surface-secondary font-medium text-primary'
                  : 'text-muted hover:text-accent',
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 divide-y divide-line-soft">
        {filteredItems.map((item) => (
          <div key={item.id} className="flex items-start gap-3 py-3.5">
            <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-xl bg-accent-soft text-[10px] font-semibold text-accent">
              {item.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[12px] font-medium">{item.sender}</h3>
                <span className="flex-none text-[10px] text-muted">{item.timeAgo}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">{item.message}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
