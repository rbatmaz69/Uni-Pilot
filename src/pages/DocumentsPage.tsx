import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Page } from '@/components/layout';
import { DocumentExplorer } from '@/features/documents';
import { NAV_ITEMS } from '@/lib/navigation';
import { readOpenDocument } from '@/lib/sidebar';

export function DocumentsPage() {
  const location = useLocation();
  const state: unknown = location.state;
  // Each visit has its own key, so opening the same favorite twice opens it twice.
  const openRequest = useMemo(() => {
    const target = readOpenDocument(state);
    return target ? { key: location.key, target } : null;
  }, [location.key, state]);
  return (
    <Page item={NAV_ITEMS.documents} hideHeader fill>
      <h1 className="sr-only">{NAV_ITEMS.documents.label}</h1>
      <p className="sr-only">{NAV_ITEMS.documents.subtitle}</p>
      <DocumentExplorer openRequest={openRequest} />
    </Page>
  );
}
