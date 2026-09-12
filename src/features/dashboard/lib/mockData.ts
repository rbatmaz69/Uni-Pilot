import type {
  ActivityNotification,
  AgendaEvent,
  Assignment,
  BusDeparture,
  Course,
  MensaMeal,
} from './types';

export const MOCK_COURSES: Course[] = [
  {
    id: 'c1',
    code: 'CS-201',
    name: 'Programming II',
    schedule: 'Next · Today · 11:00',
    tone: 'yellow',
    room: 'C 04',
    instructor: 'Prof. Dr. Weber',
  },
  {
    id: 'c2',
    code: 'CS-214',
    name: 'Database Systems',
    schedule: 'Next · Tue · 09:00',
    tone: 'blue',
    room: 'A 208',
    instructor: 'Prof. Dr. Lindqvist',
  },
  {
    id: 'c3',
    code: 'SE-110',
    name: 'Software Engineering',
    schedule: 'Next · Wed · 14:00',
    tone: 'green',
    room: 'A 312',
    instructor: 'Prof. Dr. Keller',
  },
  {
    id: 'c4',
    code: 'HCI-3',
    name: 'Human–Computer Interaction',
    schedule: 'Next · Thu · 10:00',
    tone: 'pink',
    room: 'Lab 02',
    instructor: 'Dr. Sarah Bauer',
  },
  {
    id: 'c5',
    code: 'MA-202',
    name: 'Mathematics II',
    schedule: 'Next · Fri · 08:00',
    tone: 'lavender',
    room: 'Hörsaal 1',
    instructor: 'Prof. Dr. Neumann',
  },
  {
    id: 'c6',
    code: 'MK-101',
    name: 'Marketing',
    schedule: 'Next · Fri · 13:00',
    tone: 'orange',
    room: 'B 104',
    instructor: 'Prof. Dr. Vogel',
  },
  {
    id: 'c7',
    code: 'CS-225',
    name: 'Data Structures',
    schedule: 'Next · Mon · 14:00',
    tone: 'teal',
    room: 'C 12',
    instructor: 'Dr. Michael Schmidt',
  },
];

export const INITIAL_ASSIGNMENTS: Assignment[] = [
  {
    id: 'a1',
    title: 'Database Assignment',
    course: 'Database Systems',
    due: 'Due tomorrow · 23:59',
    progress: 40,
    completed: false,
    priority: 'high',
    progressTone: 'accent',
  },
  {
    id: 'a2',
    title: 'UX Case Study',
    course: 'HCI',
    due: 'In 3 days',
    progress: 70,
    completed: false,
    priority: 'med',
    progressTone: 'coral',
  },
  {
    id: 'a3',
    title: 'Exam Registration',
    course: 'Administration',
    due: 'In 5 days',
    progress: 0,
    completed: false,
    priority: 'high',
    progressTone: 'accent',
  },
];

export const MENSA_MENU: MensaMeal[] = [
  {
    id: 'm1',
    name: 'Roasted pumpkin gnocchi',
    tag: 'Vegetarian',
    price: '3.20 €',
  },
  {
    id: 'm2',
    name: 'Herb chicken & rice bowl',
    tag: 'High protein',
    price: '4.10 €',
  },
  {
    id: 'm3',
    name: 'Lentil dahl, naan',
    tag: 'Vegan',
    price: '2.90 €',
  },
];

export const BUS_INFO: BusDeparture = {
  line: 'Bus 5',
  destination: 'Hochschule Heilbronn',
  stop: 'Bildungscampus Süd',
  minutes: 4,
  upcoming: "then in 19', 31'",
  rideDuration: '12 min ride',
};

export const NOTIFICATIONS: ActivityNotification[] = [
  {
    id: 'n1',
    sender: 'Prof. Dr. Lindqvist',
    initials: 'PD',
    source: 'Mail',
    message: 'Lab 4 submission extension & guidelines released',
    timeAgo: '4m',
    unread: true,
  },
  {
    id: 'n2',
    sender: 'Campus IT Services',
    initials: 'CI',
    source: 'System',
    message: 'VPN certificate update required for eduroam access',
    timeAgo: '15m',
    unread: true,
  },
  {
    id: 'n3',
    sender: 'Exam Office',
    initials: 'EO',
    source: 'ILIAS',
    message: 'Exam registration closes tomorrow at 18:00',
    timeAgo: '32m',
    unread: true,
  },
];

export const TODAY_AGENDA: AgendaEvent[] = [
  {
    id: 'e1',
    startTime: '09:00',
    endTime: '10:30',
    title: 'Software Engineering',
    room: 'A 312',
    tone: 'green',
  },
  {
    id: 'e2',
    startTime: '11:00',
    endTime: '12:45',
    title: 'Programming II',
    room: 'C 04',
    tone: 'yellow',
    isActive: true,
  },
  {
    id: 'e3',
    startTime: '15:00',
    endTime: '16:00',
    title: 'Project Meeting',
    room: 'B 200',
    tone: 'orange',
  },
];
