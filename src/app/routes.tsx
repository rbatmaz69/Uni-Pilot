import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { DEFAULT_ROUTE, NAV_ITEMS } from '@/lib/navigation';
import {
  AiAssistantPage,
  CalendarPage,
  CommunitiesPage,
  CoursesPage,
  DashboardPage,
  DocumentsPage,
  EventsPage,
  ExamsPage,
  FocusPage,
  GradesPage,
  SettingsPage,
  StudiesPage,
  TasksPage,
} from '@/pages';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path={NAV_ITEMS.dashboard.path} element={<DashboardPage />} />
        <Route path={NAV_ITEMS.studies.path} element={<StudiesPage />} />
        <Route path={NAV_ITEMS.calendar.path} element={<CalendarPage />} />
        <Route path={NAV_ITEMS.tasks.path} element={<TasksPage />} />
        <Route path={NAV_ITEMS.focus.path} element={<FocusPage />} />
        <Route path={NAV_ITEMS.courses.path} element={<CoursesPage />} />
        <Route path={NAV_ITEMS.exams.path} element={<ExamsPage />} />
        <Route path={NAV_ITEMS.grades.path} element={<GradesPage />} />
        <Route path={NAV_ITEMS.events.path} element={<EventsPage />} />
        <Route path={NAV_ITEMS.communities.path} element={<CommunitiesPage />} />
        <Route path={NAV_ITEMS.documents.path} element={<DocumentsPage />} />
        <Route path={NAV_ITEMS.ai.path} element={<AiAssistantPage />} />
        <Route path={NAV_ITEMS.settings.path} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      </Route>
    </Routes>
  );
}
