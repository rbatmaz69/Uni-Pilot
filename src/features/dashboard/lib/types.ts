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
