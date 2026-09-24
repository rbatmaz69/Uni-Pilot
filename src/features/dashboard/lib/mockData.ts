/**
 * Demo courses for the Courses page, until real ones come from a course
 * source. The dashboard no longer shows any of this.
 */

import type { Course } from './types';

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
