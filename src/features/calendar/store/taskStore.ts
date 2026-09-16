import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudyTask, TaskPriority } from '@/features/calendar/lib/agenda';

export interface NewTask {
  title: string;
  dueDate: string;
  dueTime: string | null;
  priority: TaskPriority;
  courseCode: string | null;
}

interface TaskState {
  tasks: StudyTask[];
  addTask: (input: NewTask) => StudyTask;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      // Starts empty on purpose. Invented coursework looks like real
      // coursework, and the calendar stopped shipping made-up data.
      tasks: [],

      addTask: (input) => {
        const task: StudyTask = { ...input, id: `task-${Date.now()}`, done: false };
        set((state) => ({ tasks: [...state.tasks, task] }));
        return task;
      },

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
        })),

      removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
    }),
    { name: 'uni-pilot.calendar-tasks' },
  ),
);
