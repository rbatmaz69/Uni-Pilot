import { Page } from '@/components/layout';
import { DocumentExplorer } from '@/features/documents';
import { NAV_ITEMS } from '@/lib/navigation';

export function DocumentsPage() {
  return (
    <Page item={NAV_ITEMS.documents} hideHeader fill>
      <h1 className="sr-only">{NAV_ITEMS.documents.label}</h1>
      <p className="sr-only">{NAV_ITEMS.documents.subtitle}</p>
      <DocumentExplorer />
    </Page>
  );
}
