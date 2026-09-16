export type CourseTone = 'yellow' | 'blue' | 'green' | 'pink' | 'lavender' | 'orange' | 'teal';

export interface Course {
  id: string;
  code: string;
  name: string;
  schedule: string;
  tone: CourseTone;
  room?: string;
  instructor?: string;
}

export interface Assignment {
  id: string;
  title: string;
  course: string;
  due: string;
  progress: number;
  completed: boolean;
  priority: 'high' | 'med' | 'low';
  progressTone?: 'accent' | 'coral' | 'yellow' | 'green';
}

export interface MensaMeal {
  id: string;
  name: string;
  tag: 'Vegetarian' | 'High protein' | 'Vegan';
  price: string;
}

export interface BusDeparture {
  line: string;
  destination: string;
  stop: string;
  minutes: number;
  upcoming: string;
  rideDuration: string;
}

export interface ActivityNotification {
  id: string;
  sender: string;
  initials: string;
  source: 'Mail' | 'ILIAS' | 'System';
  message: string;
  timeAgo: string;
  unread: boolean;
}

export interface AgendaEvent {
  date?: string;
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  room: string;
  tone: 'yellow' | 'blue' | 'green' | 'pink' | 'orange';
  isActive?: boolean;
}
