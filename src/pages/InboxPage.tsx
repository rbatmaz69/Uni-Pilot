import { Page } from '@/components/layout';
import { InboxExperience } from '@/features/mail';
import { NAV_ITEMS } from '@/lib/navigation';

export function InboxPage() {
  return (
    <Page item={NAV_ITEMS.inbox} fill quietTitle>
      <InboxExperience />
    </Page>
  );
}
