import { useEffect, useState } from 'react';
import { documentRequest, type IliasCourse } from '@/features/documents/lib/files';

/**
 * The courses the ILIAS sync keeps, read again whenever `revision` changes.
 * `null` until the first answer; empty outside the desktop app.
 */
export function useIliasCourses(desktop: boolean, revision: number): IliasCourse[] | null {
  const [courses, setCourses] = useState<IliasCourse[] | null>(desktop ? null : []);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    documentRequest<IliasCourse[]>({ action: 'ilias' })
      .then((result) => {
        if (active) setCourses(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        // Without an answer the space stays empty; the explorer shows the files regardless.
        if (active) setCourses([]);
      });
    return () => {
      active = false;
    };
  }, [desktop, revision]);
  return courses;
}
