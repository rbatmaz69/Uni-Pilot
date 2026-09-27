/**
 * Courses: the student's ILIAS courses, their folders, files and exercises.
 *
 * Read by Rust with the student's own ILIAS sign-in (`src-tauri/src/ilias_sync/`,
 * `@/features/integrations/lib/iliasSync`). Everything here reads; submitting
 * and downloading stay in ILIAS mode.
 */

export { CoursesExperience } from './components/CoursesExperience';
export { CourseSync, KEEP_ALIVE_MS } from './components/CourseSync';
export { useCourseStore, type CourseFailure, type Loaded } from './store/courseStore';
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
