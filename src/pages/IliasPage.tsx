import { Page } from '@/components/layout';
import { IliasWorkspace } from '@/features/integrations';
import { NAV_ITEMS } from '@/lib/navigation';

export function IliasPage() {
  return (
    <Page item={NAV_ITEMS.ilias}>
      <IliasWorkspace />
    </Page>
  );
}
