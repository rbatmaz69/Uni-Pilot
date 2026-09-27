import { Page } from '@/components/layout';
import { CoursesExperience } from '@/features/courses';
import { NAV_ITEMS } from '@/lib/navigation';

export function CoursesPage() {
  return (
    <Page item={NAV_ITEMS.courses}>
      <CoursesExperience />
    </Page>
  );
}
