import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

/**
 * Brings a course's files into Documents: its first sync makes the course
 * folder and keeps it in sync from then on. Downloading counts as opening the
 * files in ILIAS, so this runs only on the student's own action.
 */
export async function addCourseToDocuments(courseId: string): Promise<void> {
  const connection = useIliasStore.getState().connection;
  const course = useCourseStore.getState().courses?.items.find((item) => item.refId === courseId);
  if (!connection || !course) return;
  await useCourseFilesStore.getState().sync(connection, course);
}
