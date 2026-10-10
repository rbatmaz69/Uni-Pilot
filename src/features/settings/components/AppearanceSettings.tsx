import { Check, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDarkTheme, THEMES } from '@/lib/theme';
import { useUiStore } from '@/store/uiStore';

/** The workspace's themes, each shown as a small preview of the app in it. One is chosen at a time. */
export function AppearanceSettings() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  return (
    <>
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
    </>
  );
}
