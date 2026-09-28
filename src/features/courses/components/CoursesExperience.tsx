import { useEffect } from 'react';
import { ArrowUpRight, EyeOff, FolderSync, GraduationCap, School } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { canEmbedIlias } from '@/features/integrations/lib/iliasView';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { groupCourses, splitCourseTitle } from '@/features/courses/lib/courses';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { CourseView } from '@/features/courses/components/CourseView';
import { EmptyState, FailureNotice, SyncBar } from '@/features/courses/components/CourseNotices';
import { NAV_ITEMS } from '@/lib/navigation';

/** ref_ids arrive through the address; only digits are taken from it. */
function idParam(value: string | null): string | null {
  return value && /^\d+$/.test(value) ? value : null;
}

/**
 * The Courses page: the student's ILIAS courses, and inside them folders,
 * files and exercises — read by Rust with the student's own ILIAS sign-in.
 *
 * Where the student is travels in the address (`?course=…&trail=…&exercise=…`),
 * so back and forward work and a course can be linked from elsewhere.
 */
export function CoursesExperience() {
  const connection = useIliasStore((state) => state.connection);
  const [params] = useSearchParams();

  if (!canEmbedIlias()) {
    return (
      <EmptyState icon={GraduationCap} title="Your courses come from the desktop app">
        Uni Pilot reads your ILIAS courses with the sign-in of its ILIAS view, and only the desktop
        app has one. Open Uni Pilot there to see them.
      </EmptyState>
    );
  }

  if (!connection) {
    return (
      <EmptyState
        icon={School}
        title="Connect ILIAS to see your courses"
        action={
          <Link
            to={NAV_ITEMS.ilias.path}
            className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-medium text-accent-foreground shadow-soft transition-colors hover:bg-accent-hover"
          >
            Connect ILIAS
          </Link>
        }
      >
        Your courses, their folders and files, and your exercises with their deadlines — read from
        ILIAS with your own sign-in. Uni Pilot never sees your password.
      </EmptyState>
    );
  }

  const courseId = idParam(params.get('course'));
  if (!courseId) return <CourseOverview connection={connection} />;

  const trail = (params.get('trail') ?? '')
    .split(',')
    .map(idParam)
    .filter((id): id is string => id !== null);
  return (
    <CourseView
      connection={connection}
      courseId={courseId}
      trail={trail}
      exerciseId={idParam(params.get('exercise'))}
    />
  );
}

const TONES = [
  { surface: 'bg-accent-soft', ink: 'text-accent' },
  { surface: 'bg-blue-soft', ink: 'text-blue' },
  { surface: 'bg-green-soft', ink: 'text-green' },
  { surface: 'bg-orange-soft', ink: 'text-orange' },
  { surface: 'bg-lavender-soft', ink: 'text-lavender' },
  { surface: 'bg-teal-soft', ink: 'text-teal' },
] as const;

function CourseOverview({ connection }: { connection: IliasConnection }) {
  const courses = useCourseStore((state) => state.courses);
  const loading = useCourseStore((state) => state.loading.courses === true);
  const loadCourses = useCourseStore((state) => state.loadCourses);
  const synced = useCourseFilesStore((state) => state.folders);
  const loadFolders = useCourseFilesStore((state) => state.load);

  useEffect(() => {
    void loadCourses(connection);
    void loadFolders(connection);
  }, [connection, loadCourses, loadFolders]);

  const refresh = () => void loadCourses(connection);
  const { areas, offline } = groupCourses(courses?.items ?? []);

  return (
    <div className="flex flex-col gap-7">
      <SyncBar
        label={`From ILIAS · ${connection.name}`}
        loadedAt={courses?.loadedAt ?? null}
        loading={loading}
        onRefresh={refresh}
      />
      <FailureNotice onRetry={refresh} />

      {!courses && loading ? (
        <p className="text-[13px] text-secondary">Reading your courses from ILIAS…</p>
      ) : null}
      {courses && courses.items.length === 0 ? (
        <p className="text-[13px] text-secondary">ILIAS lists no courses or groups for you.</p>
      ) : null}

      {areas.map((area, index) => {
        const tone = TONES[index % TONES.length] ?? TONES[0];
        const headingId = `course-area-${index}`;
        return (
          <section key={area.name} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 id={headingId} className="text-[13px] font-semibold tracking-tight text-secondary">
              {area.name}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {area.courses.map((course) => {
                const { code, name } = splitCourseTitle(course.title);
                return (
                  <li key={course.refId}>
                    <Link
                      to={`?course=${course.refId}`}
                      className={`group flex h-full min-h-[132px] flex-col rounded-2xl border border-transparent p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong ${tone.surface}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className={`text-[10px] font-semibold tracking-[0.07em] ${tone.ink}`}>
                          {code ?? (course.providerType === 'grp' ? 'GROUP' : 'COURSE')}
                        </span>
                        <ArrowUpRight
                          size={15}
                          aria-hidden
                          className="text-muted/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        />
                      </span>
                      <span className="mt-2 text-[14px] font-semibold leading-snug tracking-tight text-primary">
                        {name}
                      </span>
                      {synced?.[course.refId] ? (
                        <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-secondary">
                          <FolderSync size={12} strokeWidth={1.8} aria-hidden />
                          Files in Documents
                        </span>
                      ) : null}
                      {course.description ? (
                        <span className="mt-auto line-clamp-2 pt-3 text-[11.5px] text-secondary">
                          {course.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {offline.length > 0 ? (
        <section aria-labelledby="course-offline" className="flex flex-col gap-3">
          <h2
            id="course-offline"
            className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-secondary"
          >
            <EyeOff size={14} strokeWidth={1.8} aria-hidden />
            Offline in ILIAS
          </h2>
          <p className="text-[12px] text-muted">
            You are still a member, but ILIAS does not open these right now — usually because the
            semester is over or has not started.
          </p>
          <ul className="flex flex-col divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
            {offline.map((course) => {
              const { code, name } = splitCourseTitle(course.title);
              return (
                <li
                  key={course.refId}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                >
                  <span className="text-[13px] text-secondary">
                    {code ? <span className="mr-2 text-[11px] text-muted">{code}</span> : null}
                    {name}
                  </span>
                  {course.area ? (
                    <span className="text-[11px] text-muted">{course.area}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
