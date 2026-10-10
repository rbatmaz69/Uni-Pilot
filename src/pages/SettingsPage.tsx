import { useSearchParams } from 'react-router-dom';
import { AutoSignInSettings } from '@/features/auto-sign-in';
import { ReminderSettings } from '@/features/reminders/components/ReminderSettings';
import { MailSettings } from '@/features/mail/components/MailSettings';
import {
  AppearanceSettings,
  SettingsContent,
  SettingsPanel,
  settingsSection,
} from '@/features/settings';
import { Page } from '@/components/layout';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { NAV_ITEMS } from '@/lib/navigation';

/**
 * Settings with a sidebar of its own: one section in the card at a time, chosen
 * by `?section=appearance|reminders|sign-in|mail` (Appearance when missing or unknown).
 */
export function SettingsPage() {
  const [params] = useSearchParams();
  const section = settingsSection(params.get('section'));
  return (
    <Page item={NAV_ITEMS.settings} quietTitle>
      <SettingsPanel active={section.id} />
      <SettingsContent section={section}>
        {section.id === 'appearance' ? <AppearanceSettings /> : null}
        {section.id === 'reminders' ? <ReminderSettings /> : null}
        {section.id === 'sign-in' ? <AutoSignInSettings /> : null}
        {section.id === 'mail' ? (
          isDesktopRuntime() ? (
            <MailSettings />
          ) : (
            <p className="text-sm text-secondary">
              Your mail comes through Apple Mail, which only the Uni Pilot desktop app can reach.
            </p>
          )
        ) : null}
      </SettingsContent>
    </Page>
  );
}
