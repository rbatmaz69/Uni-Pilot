import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/layout';
import { DocumentExplorer } from '@/features/documents';
import { NAV_ITEMS } from '@/lib/navigation';

/** Only workspace-relative folders are taken from the address. */
function workspacePath(value: string | null): string {
  if (!value) return '';
  const parts = value.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..') ? value : '';
}

export function DocumentsPage() {
  const [params] = useSearchParams();
  const path = workspacePath(params.get('path'));
  return (
    <Page item={NAV_ITEMS.documents} hideHeader fill>
      <h1 className="sr-only">{NAV_ITEMS.documents.label}</h1>
      <p className="sr-only">{NAV_ITEMS.documents.subtitle}</p>
      {/* A new link opens a new folder: the explorer starts over from it. */}
      <DocumentExplorer key={path} initialPath={path} />
    </Page>
  );
}
