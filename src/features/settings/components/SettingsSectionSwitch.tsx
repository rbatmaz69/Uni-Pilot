import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  SETTINGS_SECTIONS,
  settingsSectionPath,
  type SettingsSectionId,
} from '@/features/settings/lib/sections';

/**
 * The sections as a compact row of links, for when Settings' sidebar is hidden:
 * the student can still go from one section to another without bringing it back.
 */
export function SettingsSectionSwitch({ active }: { active: SettingsSectionId }) {
  return (
    <nav
      aria-label="Settings sections"
      className="scroll-area mb-7 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-secondary p-1"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const current = section.id === active;
        return (
          <Link
            key={section.id}
            to={settingsSectionPath(section.id)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex flex-none items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              current
                ? 'bg-surface text-primary shadow-soft ring-1 ring-line'
                : 'text-secondary hover:text-primary',
            )}
          >
            <section.icon size={15} strokeWidth={1.8} aria-hidden />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
