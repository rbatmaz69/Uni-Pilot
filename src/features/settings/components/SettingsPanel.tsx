import { SectionPanel } from '@/components/layout/SectionPanel';
import { PanelBody, PanelHeader, PanelItem, PanelSection } from '@/components/layout/Panel';
import {
  SETTINGS_SECTIONS,
  settingsSectionPath,
  type SettingsSectionId,
} from '@/features/settings/lib/sections';

/**
 * Settings' own sidebar: one row per section. The section shown is the URL's
 * (`?section=`), so the rows are links and the panel keeps no state of its own.
 */
export function SettingsPanel({ active }: { active: SettingsSectionId }) {
  return (
    <SectionPanel label="Settings">
      <PanelHeader title="Settings" />
      <PanelBody>
        <PanelSection>
          {SETTINGS_SECTIONS.map((section) => (
            <PanelItem
              key={section.id}
              icon={section.icon}
              label={section.label}
              active={section.id === active}
              to={settingsSectionPath(section.id)}
            />
          ))}
        </PanelSection>
      </PanelBody>
    </SectionPanel>
  );
}
