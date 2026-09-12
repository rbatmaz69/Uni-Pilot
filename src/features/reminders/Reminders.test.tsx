import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EventComposerDialog } from '@/features/calendar/components/EventComposerDialog';
import { EventDetailsDialog } from '@/features/calendar/components/EventDetailsDialog';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { ReminderHistoryPanel } from '@/features/reminders/components/ReminderHistoryPanel';
import { ReminderSettings } from '@/features/reminders/components/ReminderSettings';
import { currentSchedule, historyAction } from '@/features/reminders/lib/runtime';
import { defaultRule, nextReminder } from '@/features/reminders/lib/engine';
import type { CalendarEvent } from '@/features/calendar/lib/types';

const exam: CalendarEvent = {
  id: 'exam',
  title: 'Algorithms',
  date: '2099-09-20',
  startTime: '10:00',
  endTime: '12:00',
  kind: 'exam',
  tone: 'coral',
  status: 'confirmed',
};

describe('Reminder controls and persistence', () => {
  it('creates an exam with defaults and restores events and rules after rehydration', async () => {
    const user = userEvent.setup();
    render(
      <EventComposerDialog
        draft={{ date: exam.date, startTime: exam.startTime }}
        onClose={() => {}}
        onSubmit={(event) => useEventStore.getState().add(event)}
      />,
    );
    await user.type(screen.getByLabelText('Title'), 'Algorithms');
    await user.selectOptions(screen.getByLabelText('Type'), 'exam');
    expect(screen.getByRole('checkbox', { name: 'Reminders' })).toBeChecked();
    expect(screen.getByRole('button', { name: '1 week' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));
    const event = useEventStore.getState().events[0]!;
    expect(useReminderStore.getState().rules[event.id]?.offsets).toEqual([10080, 2880, 60]);
    const eventsJson = localStorage.getItem('uni-pilot.calendar-events')!;
    const remindersJson = localStorage.getItem('uni-pilot.reminders')!;
    useEventStore.setState({ events: [] });
    useReminderStore.setState({ rules: {} });
    localStorage.setItem('uni-pilot.calendar-events', eventsJson);
    localStorage.setItem('uni-pilot.reminders', remindersJson);
    await act(async () => {
      await useEventStore.persist.rehydrate();
      await useReminderStore.persist.rehydrate();
    });
    expect(useEventStore.getState().events[0]?.title).toBe('Algorithms');
    expect(useReminderStore.getState().rules[event.id]?.offsets).toEqual([10080, 2880, 60]);
  });
  it('edits reminders for subscribed events without changing the source', async () => {
    const user = userEvent.setup();
    useSourceStore.setState({
      sources: [
        {
          id: 'source',
          kind: 'file',
          name: 'University',
          url: null,
          lastSyncedAt: null,
          error: null,
          raw: '',
          events: [exam],
        },
      ],
    });
    render(
      <EventDetailsDialog
        event={{ ...exam, sourceId: 'source' }}
        now={new Date()}
        sourceName="University"
        onClose={() => {}}
        onRemove={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '1 week' }));
    await user.selectOptions(screen.getByLabelText('Also remind me once a day'), '7');
    await user.click(screen.getByRole('button', { name: 'Quiet card' }));
    const amount = screen.getByLabelText('Custom reminder amount');
    await user.clear(amount);
    await user.type(amount, '5');
    await user.click(screen.getByRole('button', { name: 'Add custom reminder' }));
    expect(useReminderStore.getState().rules.exam).toMatchObject({
      offsets: [7200, 2880, 60],
      dailyDays: 7,
      style: 'quiet',
    });
    expect(useSourceStore.getState().sources[0]?.events).toEqual([exam]);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(useReminderStore.getState().preview?.title).toBe('Algorithms');
    expect(useReminderStore.getState().history).toEqual([]);
  });
  it('rejects an invalid custom reminder and exposes empty schedules', async () => {
    const user = userEvent.setup();
    render(
      <EventDetailsDialog
        event={exam}
        now={new Date()}
        sourceName={null}
        onClose={() => {}}
        onRemove={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Custom reminder amount'), { target: { value: '-1' } });
    await user.click(screen.getByRole('button', { name: 'Add custom reminder' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a whole number');
    for (const label of ['1 week', '2 days', '1 hour'])
      await user.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText('Select a timing to receive reminders.')).toBeVisible();
  });
  it('snoozes, dismisses and mutes via the actual history', async () => {
    const user = userEvent.setup();
    useEventStore.getState().add(exam);
    const now = new Date(2099, 8, 18, 10);
    const record = nextReminder(
      currentSchedule(),
      [],
      now,
      { enabled: true, quietStart: '00:00', quietEnd: '00:00' },
      true,
    )!.record;
    useReminderStore.setState({ history: [record] });
    render(<ReminderHistoryPanel />);
    await user.click(screen.getByRole('button', { name: 'Snooze 30 min' }));
    expect(useReminderStore.getState().history[0]?.snoozeUntil).not.toBeNull();
    await act(async () => {
      await historyAction(record.id, 'dismiss');
    });
    expect(useReminderStore.getState().history[0]?.snoozeUntil).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mute this event' }));
    expect(useReminderStore.getState().rules.exam?.enabled).toBe(false);
    expect(currentSchedule()).toEqual([]);
  });
  it('saves the master toggle and quiet hours', async () => {
    const user = userEvent.setup();
    render(<ReminderSettings />);
    await user.click(screen.getByRole('checkbox', { name: 'Calendar reminders' }));
    fireEvent.change(screen.getByLabelText('Quiet hours start'), { target: { value: '21:00' } });
    expect(useReminderStore.getState().settings).toMatchObject({
      enabled: false,
      quietStart: '21:00',
    });
  });
  it('does not offer reminders on a cancelled exam', () => {
    render(
      <EventDetailsDialog
        event={{ ...exam, status: 'cancelled' }}
        now={new Date()}
        sourceName={null}
        onClose={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(
      within(screen.getByRole('dialog')).queryByRole('checkbox', { name: 'Reminders' }),
    ).not.toBeInTheDocument();
    expect(defaultRule('exam').enabled).toBe(true);
  });
});
