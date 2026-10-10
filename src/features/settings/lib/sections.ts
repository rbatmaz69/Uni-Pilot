import { Bell, KeyRound, Mail, Palette, type LucideIcon } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';

export type SettingsSectionId = 'appearance' | 'reminders' | 'sign-in' | 'mail';

export interface SettingsSection {
  /** What `?section=` carries, so `/settings?section=mail` can be linked to. */
  id: SettingsSectionId;
  /** The row in Settings' sidebar, and the heading above the section. */
  label: string;
  /** One line under the heading: what lives here. */
  description: string;
  icon: LucideIcon;
}

/** The sections of Settings, in the order the sidebar lists them. The first is the default. */
export const SETTINGS_SECTIONS: readonly [SettingsSection, ...SettingsSection[]] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Choose the workspace that feels right for you.',
    icon: Palette,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    description: 'When Uni Pilot gives you a heads-up, and when it keeps quiet.',
    icon: Bell,
  },
  {
    id: 'sign-in',
    label: 'Automatic sign-in',
    description: 'Let Uni Pilot sign in to ILIAS for you when it asks again.',
    icon: KeyRound,
  },
  {
    id: 'mail',
    label: 'Mail',
    description: 'How the Inbox opens, and what it keeps on this Mac.',
    icon: Mail,
  },
];

/**
 * The section a `?section=` value names. Anything else, a missing value or one
 * from an older link, shows the first section rather than an empty page.
 */
export function settingsSection(param: string | null | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section.id === param) ?? SETTINGS_SECTIONS[0];
}

/** Where a section lives, e.g. `/settings?section=mail`. */
export function settingsSectionPath(id: SettingsSectionId): string {
  return `${NAV_ITEMS.settings.path}?section=${id}`;
}
