import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/layout';
import { canEmbedIlias, IliasWorkspace, useIliasStore } from '@/features/integrations';
import { NAV_ITEMS } from '@/lib/navigation';

export function IliasPage() {
  const connected = useIliasStore((state) => state.connection !== null);
  const [params] = useSearchParams();

  // ILIAS mode: the ILIAS panel and ILIAS itself take the place of the card. The
  // panel tells the shell (`uiStore.iliasMode`) once it is on screen.
  const embedded = connected && canEmbedIlias();

  return (
    <Page item={NAV_ITEMS.ilias} fill={embedded} hideHeader={embedded}>
      <IliasWorkspace target={params.get('target') ?? undefined} />
    </Page>
  );
}
