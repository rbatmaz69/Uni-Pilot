import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReminderService } from './ReminderService';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { previewEvent } from '@/features/reminders/lib/runtime';
import { defaultRule } from '@/features/reminders/lib/engine';
import type { CalendarEvent } from '@/features/calendar/lib/types';

const exam: CalendarEvent = {
  id: 'exam',
  title: 'Algorithms',
  date: '2026-09-20',
  startTime: '10:00',
  endTime: '12:00',
  kind: 'exam',
  tone: 'coral',
  status: 'confirmed',
};
afterEach(() => vi.useRealTimers());
describe('Application reminder service', () => {
  it('previews immediately without consuming a real reminder', () => {
    render(<ReminderService />);
    act(() => {
      previewEvent(exam, defaultRule('exam'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Algorithms');
    expect(useReminderStore.getState().history).toEqual([]);
  });
  it('delivers across route-independent remounts without repeating', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 18, 10));
    useEventStore.getState().add(exam);
    const first = render(<ReminderService />);
    expect(screen.getByRole('status')).toHaveTextContent('Algorithms');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(screen.queryByRole('status')).toBeNull();
    first.unmount();
    render(<ReminderService />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(useReminderStore.getState().history).toHaveLength(1);
  });
});
