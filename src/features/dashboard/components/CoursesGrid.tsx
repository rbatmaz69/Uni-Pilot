import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  Database,
  Layers,
  MousePointer2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { MOCK_COURSES } from '@/features/dashboard/lib/mockData';

const courseStyles = [
  {
    icon: Code2,
    surface: 'bg-[#eef2ff] dark:bg-accent-soft',
    ink: 'text-[#596cce] dark:text-accent',
  },
  {
    icon: Database,
    surface: 'bg-[#edf5f8] dark:bg-blue-soft',
    ink: 'text-[#4e899e] dark:text-blue',
  },
  {
    icon: Layers,
    surface: 'bg-[#eff5ef] dark:bg-green-soft',
    ink: 'text-[#67846a] dark:text-green',
  },
  {
    icon: MousePointer2,
    surface: 'bg-[#f9f2eb] dark:bg-orange-soft',
    ink: 'text-[#b8885b] dark:text-orange',
  },
];

export function CoursesGrid({ all = false }: { all?: boolean }) {
  const courses = all ? MOCK_COURSES : MOCK_COURSES.slice(0, 4);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BookOpen size={17} strokeWidth={1.7} className="text-muted" />
          <h2 className="text-[16px] font-semibold tracking-tight text-primary">My courses</h2>
          <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-muted">
            {MOCK_COURSES.length}
          </span>
        </div>
        {!all && (
          <Link
            to="/courses"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-secondary transition-colors hover:text-accent"
          >
            All courses <ArrowRight size={13} />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {courses.map((course, index) => {
          const style = courseStyles[index % courseStyles.length]!;
          const Icon = style.icon;
          return (
            <Link
              key={course.id}
              to={`/courses?course=${course.id}`}
              className={`group flex min-h-[159px] flex-col rounded-2xl border border-transparent p-4 transition duration-200 hover:-translate-y-1 hover:border-line-strong ${style.surface}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-xl bg-surface/75 ${style.ink}`}
                >
                  <Icon size={20} strokeWidth={1.7} />
                </span>
                <ArrowUpRight
                  size={15}
                  className="text-muted/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </div>
              <span className={`mt-4 text-[9px] font-semibold tracking-[0.07em] ${style.ink}`}>
                {course.code}
              </span>
              <h3 className="mt-1 text-[13px] font-semibold leading-snug tracking-tight text-primary">
                {course.name}
              </h3>
              <p className="mt-auto pt-3 text-[10px] text-secondary">{course.schedule}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
