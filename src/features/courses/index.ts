/**
 * Courses: the student's ILIAS courses, their folders, files and exercises.
 *
 * Read by Rust with the student's own ILIAS sign-in (`src-tauri/src/ilias_sync/`,
 * `@/features/integrations/lib/iliasSync`). Submitting stays in ILIAS mode.
 * Files go into the student's Documents, in the course's `ILIAS` folder —
 * one clicked, or all of a course the student switched on
 * (`docs/integrations/ilias-course-files.md`).
 */

export { CoursesExperience } from './components/CoursesExperience';
export { CourseSync, KEEP_ALIVE_MS } from './components/CourseSync';
export { CourseFiles } from './components/CourseFiles';
export { useCourseStore, type CourseFailure, type Loaded } from './store/courseStore';
export {
  AUTO_SYNC_MS,
  listenToCourseFiles,
  useCourseFilesStore,
  type FileSaving,
} from './store/courseFilesStore';
export {
  courseFolderName,
  courseTarget,
  semesterLabel,
  semesterOf,
  type Semester,
} from './lib/semester';
export {
  containerFor,
  dueLabel,
  formatIliasDate,
  formatSize,
  groupByBlock,
  groupCourses,
  iliasTarget,
  itemKind,
  parseIliasDate,
  splitCourseTitle,
  type ContentBlock,
  type CourseArea,
  type ItemKind,
} from './lib/courses';
