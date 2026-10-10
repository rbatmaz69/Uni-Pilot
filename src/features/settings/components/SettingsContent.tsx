import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useSectionPanelShown } from '@/components/layout/sectionPanelHost';
import { SettingsSectionSwitch } from '@/features/settings/components/SettingsSectionSwitch';
import type { SettingsSection } from '@/features/settings/lib/sections';
import { TONE_SURFACE } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * What the card shows for one section: its heading and what is under it. While
 * the sidebar is hidden it also offers the sections as a row of links, so the
 * student can still move between them.
 */
export function SettingsContent({
  section,
  children,
}: {
  section: SettingsSection;
  children: ReactNode;
}) {
  const headingId = useId();
  const root = useRef<HTMLDivElement>(null);
  const Icon = section.icon;
  const panelHidden = !useSectionPanelShown();

  // A new section starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    const scroller = root.current?.closest('main');
    if (scroller) scroller.scrollTop = 0;
  }, [section.id]);

  return (
    <div ref={root} className="mx-auto w-full max-w-3xl pb-6 pt-2">
      {panelHidden ? <SettingsSectionSwitch active={section.id} /> : null}
      <div className="mb-6 flex items-center gap-3.5">
        <span
          aria-hidden
          className={cn(
            'grid h-11 w-11 flex-none place-items-center rounded-2xl',
            TONE_SURFACE.accent,
          )}
        >
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-[22px] font-semibold tracking-[-0.02em] text-primary">
            {section.label}
          </h2>
          <p className="mt-0.5 text-[13px] text-secondary">{section.description}</p>
        </div>
      </div>
      <div aria-labelledby={headingId} role="group">
        {children}
      </div>
    </div>
  );
}
