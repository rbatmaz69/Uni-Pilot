import { Check, Moon, PanelLeft, Sun } from 'lucide-react';
import { ReminderSettings } from '@/features/reminders/components/ReminderSettings';
import { MailSettings } from '@/features/mail/components/MailSettings';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { isDarkTheme, THEMES } from '@/lib/theme';

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
          {THEMES.map((option) => (
            <button
              key={option.name}
              type="button"
              aria-label={option.label}
              aria-pressed={theme === option.name}
              onClick={() => setTheme(option.name)}
              className={cn(
                'overflow-hidden rounded-2xl border p-3 text-left transition-colors',
                theme === option.name
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span
                aria-hidden
                data-theme={option.name}
                className="flex h-28 gap-3 rounded-xl border border-line bg-app p-3"
              >
                <span className="flex w-1/4 flex-col gap-2 rounded-md bg-sidebar p-2">
                  <span className="mb-1 block h-3 w-3 rounded-md bg-accent" />
                  <span className="block h-1.5 w-full rounded-full bg-sidebar-active" />
                  <span className="block h-1.5 w-2/3 rounded-full bg-sidebar-muted/25" />
                  <span className="block h-1.5 w-3/4 rounded-full bg-sidebar-muted/25" />
                </span>
                <span className="flex-1 rounded-lg bg-surface p-3">
                  <span className="block h-2 w-2/3 rounded-full bg-primary/30" />
                  <span className="mt-2 block h-1 w-1/2 rounded-full bg-muted/25" />
                  <span className="mt-3 flex gap-1.5">
                    <span className="h-6 flex-1 rounded-md border-l-2 border-teal bg-teal-soft" />
                    <span className="h-6 flex-1 rounded-md border-l-2 border-orange bg-orange-soft" />
                    <span className="h-6 flex-1 rounded-md border-l-2 border-lavender bg-lavender-soft" />
                  </span>
                </span>
              </span>
              <span className="mt-3 flex items-center gap-2 text-sm font-medium">
                {isDarkTheme(option.name) ? <Moon size={16} /> : <Sun size={16} />}
                {option.label}
                {theme === option.name && <Check size={16} className="ml-auto text-accent" />}
              </span>
              <span className="mt-1 block text-xs text-secondary">{option.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-secondary">
          Flexoki is an inky color scheme by{' '}
          <a
            href="https://stephango.com/flexoki"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            Steph Ango
          </a>
          . Your choice is saved for your next visit.
        </p>
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
      <MailSettings />
    </Page>
  );
}
