import { Check, Moon, PanelLeft, Sun } from 'lucide-react';
import { ReminderSettings } from '@/features/reminders/components/ReminderSettings';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { theme, setTheme, sidebarCollapsed, toggleSidebar } = useUiStore();
  return (
    <Page item={NAV_ITEMS.settings}>
      <section className="max-w-3xl rounded-2xl border border-line p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Make yourself at home</h2>
        <p className="mt-1 text-sm text-secondary">
          Choose the workspace that feels right for you.
        </p>
        <h3 className="mb-3 mt-7 text-xs font-medium text-secondary">Appearance</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['light', 'dark'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={theme === option}
              onClick={() => setTheme(option)}
              className={cn(
                'overflow-hidden rounded-2xl border p-3 text-left transition-colors',
                theme === option
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-28 gap-3 rounded-xl p-3',
                  option === 'light' ? 'bg-[#dceef6]' : 'bg-[#1d2c40]',
                )}
              >
                <span className="w-1/4 rounded-md bg-white/15" />
                <span
                  className={cn(
                    'flex-1 rounded-lg p-4',
                    option === 'light' ? 'bg-white' : 'bg-[#2d3440]',
                  )}
                >
                  <span className="block h-2 w-2/3 rounded-full bg-[#9babc0]/30" />
                  <span className="mt-3 block h-8 rounded-lg bg-[#9babc0]/15" />
                </span>
              </span>
              <span className="mt-3 flex items-center gap-2 text-sm font-medium">
                {option === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                {option === 'light' ? 'Light & airy' : 'After hours'}
                {theme === option && <Check size={16} className="ml-auto text-accent" />}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-7 flex items-center justify-between gap-4 border-t border-line-soft pt-6">
          <div className="flex items-center gap-3">
            <PanelLeft size={19} className="text-muted" />
            <div>
              <h3 className="text-sm font-medium">Compact sidebar</h3>
              <p className="mt-1 text-xs text-muted">More room for what you&apos;re working on.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sidebarCollapsed}
            aria-label="Compact sidebar"
            onClick={toggleSidebar}
            className={cn(
              'flex h-6 w-10 flex-none items-center rounded-full p-1 transition-colors',
              sidebarCollapsed ? 'bg-accent' : 'bg-line-strong',
            )}
          >
            <span
              className={cn(
                'h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                sidebarCollapsed && 'translate-x-4',
              )}
            />
          </button>
        </div>
      </section>
      <ReminderSettings />
    </Page>
  );
}
