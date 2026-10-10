/**
 * Settings, one section at a time: a sidebar of sections (`SettingsPanel`), the
 * section's heading and body in the card (`SettingsContent`), and a row of links
 * for moving between sections while the sidebar is hidden. The section is the
 * URL's `?section=`. The settings themselves live with their features.
 */

export { AppearanceSettings } from './components/AppearanceSettings';
export { SettingsContent } from './components/SettingsContent';
export { SettingsPanel } from './components/SettingsPanel';
export {
  SETTINGS_SECTIONS,
  settingsSection,
  settingsSectionPath,
  type SettingsSection,
  type SettingsSectionId,
} from './lib/sections';
