import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/layout';
import { canEmbedIlias, IliasWorkspace, useIliasStore } from '@/features/integrations';
import { NAV_ITEMS } from '@/lib/navigation';

export function IliasPage() {
  const connected = useIliasStore((state) => state.connection !== null);
  const [params] = useSearchParams();
  // Embedded ILIAS takes the rest of the window rather than scrolling with the page.
  const embedded = connected && canEmbedIlias();

  return (
    <Page item={NAV_ITEMS.ilias} fill={embedded}>
      <IliasWorkspace target={params.get('target') ?? undefined} />
    </Page>
  );
}
