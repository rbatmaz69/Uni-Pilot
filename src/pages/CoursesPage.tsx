import { BookOpen, MapPin, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CoursesGrid } from '@/features/dashboard';
import { MOCK_COURSES } from '@/features/dashboard/lib/mockData';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';

export function CoursesPage() {
  const [params] = useSearchParams();
  const course = MOCK_COURSES.find((item) => item.id === params.get('course'));
  return (
    <Page item={NAV_ITEMS.courses}>
      {course && (
        <section className="welcome-card rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-accent">{course.code}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{course.name}</h2>
            </div>
            <BookOpen size={24} className="text-accent" strokeWidth={1.5} />
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-xs text-secondary">
            <span className="flex items-center gap-2">
              <UserRound size={14} />
              {course.instructor}
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={14} />
              {course.room}
            </span>
            <span>{course.schedule}</span>
          </div>
          <Link to="/courses" className="mt-5 inline-block text-xs font-medium text-accent">
            Back to all courses
          </Link>
        </section>
      )}
      <CoursesGrid all />
    </Page>
  );
}
