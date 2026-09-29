import { useLocation, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/layout';
import { DocumentExplorer, type IliasCourseView } from '@/features/documents';
import { NAV_ITEMS } from '@/lib/navigation';

/** Only workspace-relative folders are taken from the address. */
function workspacePath(value: string | null): string {
  if (!value) return '';
  const parts = value.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..') ? value : '';
}

/** ILIAS ref_ids arrive through the address; nothing but ids is taken from it. */
function idParam(value: string | null): string | null {
  return value && /^[\w-]+$/.test(value) ? value : null;
}

export function DocumentsPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const path = workspacePath(params.get('path'));
  const file = workspacePath(params.get('file')) || null;
  const courseId = idParam(params.get('course'));
  const course: IliasCourseView | null = courseId
    ? {
        courseId,
        trail: (params.get('trail') ?? '')
          .split(',')
          .map(idParam)
          .filter((id): id is string => id !== null),
        exerciseId: idParam(params.get('exercise')),
      }
    : null;
  return (
    <Page item={NAV_ITEMS.documents} hideHeader fill>
      <h1 className="sr-only">{NAV_ITEMS.documents.label}</h1>
      <p className="sr-only">{NAV_ITEMS.documents.subtitle}</p>
      {/* Each link is a request the open explorer follows, keeping its view and tabs. */}
      <DocumentExplorer
        initialPath={path}
        initialCourse={course}
        initialFile={file}
        request={location.key}
      />
    </Page>
  );
}
