import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, formatDayLabel, localDateKey, startOfWeek } from '@/lib/date';
import { NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';
import type { StudyTask } from '@/features/calendar/lib/agenda';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { seedTestSource } from '@/features/calendar/lib/testFeed';

const monday = startOfWeek(new Date());
const wednesday = addDays(monday, 2);

const task = (overrides: Partial<StudyTask> & { id: string; title: string }): StudyTask => ({
  dueDate: localDateKey(wednesday),
  dueTime: null,
  priority: 'med',
  courseCode: null,
  done: false,
  ...overrides,
});

const seed = (...tasks: StudyTask[]) => useTaskStore.setState({ tasks });
const grid = () => screen.getByRole('region', { name: 'Week schedule' });

describe('tasks on the week grid', () => {
  it('pins a task without a time in the all-day row', () => {
    seed(task({ id: 't1', title: 'Read chapter 4' }));
    renderApp(NAV_ITEMS.calendar.path);

    expect(
      within(grid()).getByRole('button', {
        name: `Read chapter 4, task on ${formatDayLabel(wednesday)}`,
      }),
    ).toBeVisible();
  });

  it('places a task with a time on the axis instead', () => {
    seed(task({ id: 't2', title: 'Call the lab', dueTime: '14:00' }));
    renderApp(NAV_ITEMS.calendar.path);

    expect(
      within(grid()).getByRole('button', {
        name: `Call the lab, task, ${formatDayLabel(wednesday)} at 14:00`,
      }),
    ).toBeVisible();
  });

  it('opens the axis far enough for an early task', () => {
    seed(task({ id: 't3', title: 'Early start', dueTime: '06:30' }));
    renderApp(NAV_ITEMS.calendar.path);

    expect(within(grid()).getByText('06:00')).toBeVisible();
  });

  it('reports whether a task is done', async () => {
    const user = userEvent.setup();
    seed(task({ id: 't4', title: 'Tick me' }));
    renderApp(NAV_ITEMS.calendar.path);

    const chip = within(grid()).getByRole('button', { name: /^Tick me, task on/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(useTaskStore.getState().tasks[0]?.done).toBe(true);
  });

  it('keeps a task out of the way when a kind filter is on', async () => {
    const user = userEvent.setup();
    seed(task({ id: 't5', title: 'Hidden by filter' }));
    seedTestSource();
    renderApp(NAV_ITEMS.calendar.path);

    expect(within(grid()).getByRole('button', { name: /^Hidden by filter/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: /^Lectures/ }));

    // Asking for lectures only is an answer about events; a task is not one.
    expect(within(grid()).queryByRole('button', { name: /^Hidden by filter/ })).toBeNull();
  });
});

describe('the empty grid', () => {
  it('does not claim to be empty while a task sits on it', () => {
    seed(task({ id: 't6', title: 'Something to do' }));
    renderApp(NAV_ITEMS.calendar.path);

    expect(screen.queryByText('Nothing scheduled')).toBeNull();
  });

  it('still says so when there really is nothing', () => {
    renderApp(NAV_ITEMS.calendar.path);

    expect(screen.getByText('Nothing scheduled')).toBeVisible();
  });
});

describe('giving a task a time', () => {
  const openComposer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Add task' }));
  };

  it('explains where an untimed task will land', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.calendar.path);
    await openComposer(user);

    expect(screen.getByText('No time: sits in the all-day row.')).toBeVisible();
  });

  it('switches the explanation once a time is named', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.calendar.path);
    await openComposer(user);

    fireEvent.change(screen.getByLabelText('Time, optional'), { target: { value: '11:15' } });

    expect(screen.getByText('Shows on the week grid at that time.')).toBeVisible();
  });

  it('puts a timed task straight onto the axis', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.calendar.path);
    await openComposer(user);

    await user.type(screen.getByLabelText('Task'), 'Submit the form');
    fireEvent.change(screen.getByLabelText('Due date'), {
      target: { value: localDateKey(wednesday) },
    });
    fireEvent.change(screen.getByLabelText('Time, optional'), { target: { value: '11:15' } });
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      within(grid()).getByRole('button', {
        name: `Submit the form, task, ${formatDayLabel(wednesday)} at 11:15`,
      }),
    ).toBeVisible();
  });
});
