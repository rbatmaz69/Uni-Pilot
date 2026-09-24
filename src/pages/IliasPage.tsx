import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/layout';
import { canEmbedIlias, IliasWorkspace, useIliasStore } from '@/features/integrations';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';

export function IliasPage() {
  const connected = useIliasStore((state) => state.connection !== null);
  const setImmersive = useUiStore((state) => state.setImmersive);
  const [params] = useSearchParams();

  // ILIAS mode: the sidebar and header step aside and ILIAS gets the window.
  const immersive = connected && canEmbedIlias();

  useEffect(() => {
    setImmersive(immersive);
    return () => setImmersive(false);
  }, [immersive, setImmersive]);

  return (
    <Page item={NAV_ITEMS.ilias} fill={immersive} hideHeader={immersive}>
      <IliasWorkspace target={params.get('target') ?? undefined} />
    </Page>
  );
}
