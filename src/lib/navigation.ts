import {
  Award,
  BookOpen,
  CalendarDays,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  PartyPopper,
  Settings,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import type { NavItem, NavSection } from '@/types';

export const NAV_ITEMS = {
  dashboard: {
    path: '/dashboard',
    label: 'Dashboard',
    subtitle: 'Your university life at a glance.',
    placeholder: 'This area will hold your customisable dashboard.',
    icon: LayoutDashboard,
    tone: 'accent',
  },
  studies: {
    path: '/studies',
    label: 'My Studies',
    subtitle: 'Your degree, semesters and progress in one place.',
    placeholder: 'This area will show your study programme and progress.',
    icon: GraduationCap,
    tone: 'lavender',
  },
  calendar: {
    path: '/calendar',
    label: 'Calendar',
    subtitle: 'Lectures, deadlines and everything in between.',
    placeholder: 'This area will show your semester calendar.',
    icon: CalendarDays,
    tone: 'blue',
  },
  tasks: {
    path: '/tasks',
    label: 'Tasks',
    subtitle: 'Everything you need to get done.',
    placeholder: 'This area will hold your task lists and boards.',
    icon: ListTodo,
    tone: 'green',
  },
  focus: {
    path: '/focus',
    label: 'Focus',
    subtitle: 'Deep work sessions, without the noise.',
    placeholder: 'This area will hold your focus timer and session history.',
    icon: Timer,
    tone: 'pink',
  },
  courses: {
    path: '/courses',
    label: 'Courses',
    subtitle: 'Every module you are enrolled in.',
    placeholder: 'This area will list your enrolled courses.',
    icon: BookOpen,
    tone: 'yellow',
  },
  exams: {
    path: '/exams',
    label: 'Exams',
    subtitle: 'Registrations, dates and preparation.',
    placeholder: 'This area will show your exam schedule and registrations.',
    icon: FileText,
    tone: 'pink',
  },
  grades: {
    path: '/grades',
    label: 'Grades',
    subtitle: 'Results, averages and credit points.',
    placeholder: 'This area will show your grades and credit progress.',
    icon: Award,
    tone: 'green',
  },
  events: {
    path: '/events',
    label: 'Events',
    subtitle: 'What is happening around campus.',
    placeholder: 'This area will show university and student events.',
    icon: PartyPopper,
    tone: 'yellow',
  },
  communities: {
    path: '/communities',
    label: 'Communities',
    subtitle: 'Study groups, clubs and course spaces.',
    placeholder: 'This area will hold your groups and communities.',
    icon: Users,
    tone: 'lavender',
  },
  documents: {
    path: '/documents',
    label: 'Documents',
    subtitle: 'Scripts, notes and files that matter.',
    placeholder: 'This area will hold your documents and lecture materials.',
    icon: FolderOpen,
    tone: 'blue',
  },
  ai: {
    path: '/ai',
    label: 'AI Assistant',
    subtitle: 'A study companion that knows your semester.',
    placeholder: 'This area will hold your AI study assistant.',
    icon: Sparkles,
    tone: 'accent',
  },
  settings: {
    path: '/settings',
    label: 'Settings',
    subtitle: 'Preferences, appearance and account.',
    placeholder: 'This area will hold your application preferences.',
    icon: Settings,
    tone: 'accent',
  },
} as const satisfies Record<string, NavItem>;

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [NAV_ITEMS.dashboard, NAV_ITEMS.studies],
  },
  {
    id: 'planning',
    label: 'Planning',
    items: [NAV_ITEMS.calendar, NAV_ITEMS.tasks, NAV_ITEMS.focus],
  },
  {
    id: 'academics',
    label: 'Academics',
    items: [NAV_ITEMS.courses, NAV_ITEMS.exams, NAV_ITEMS.grades],
  },
  {
    id: 'campus',
    label: 'Campus',
    items: [NAV_ITEMS.events, NAV_ITEMS.communities, NAV_ITEMS.documents],
  },
  {
    id: 'assistant',
    label: 'Assistant',
    items: [NAV_ITEMS.ai],
  },
];

export const DEFAULT_ROUTE = NAV_ITEMS.dashboard.path;

const ITEMS_BY_PATH = new Map<string, NavItem>(
  Object.values(NAV_ITEMS).map((item) => [item.path, item]),
);

export function getNavItemByPath(path: string): NavItem | undefined {
  return ITEMS_BY_PATH.get(path);
}
