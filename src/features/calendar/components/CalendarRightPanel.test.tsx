import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addDays, localDateKey } from '@/lib/date';
import { CalendarRightPanel } from './CalendarRightPanel';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import type { CalendarEvent } from '@/features/calendar/lib/types';

const now = new Date(2026, 8, 28, 9, 0);
const key = (offset: number) => localDateKey(addDays(now, offset));

const exam: CalendarEvent = {
  id: 'e1',
  title: 'Klausur Machine Learning',
  kind: 'exam',
  tone: 'coral',
  date: key(2),
  startTime: '09:00',
  endTime: '11:00',
  status: 'confirmed',
  room: 'Aula',
  courseCode: '262198',
};

const renderPanel = (events: CalendarEvent[] = []) =>
  render(<CalendarRightPanel focusDay={now} onSelectDate={vi.fn()} events={events} now={now} />);

const list = () => screen.getByRole('region', { name: 'Tasks and deadlines' });

const addTask = async (user: ReturnType<typeof userEvent.setup>, title: string, dueOffset = 0) => {
  await user.click(screen.getByRole('button', { name: 'Add task' }));
  await user.type(screen.getByLabelText('Task'), title);
  const date = screen.getByLabelText('Due date');
  await user.clear(date);
  await user.type(date, key(dueOffset));
  await user.click(screen.getByRole('button', { name: 'Add' }));
};

describe('the mini month', () => {
  it('shows the month of the focused day', () => {
    renderPanel();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('reports a clicked day back to the calendar', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CalendarRightPanel focusDay={now} onSelectDate={onSelect} now={now} />);

    await user.click(screen.getByRole('button', { name: /15 September 2026|September 15, 2026/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0]?.[0] as Date | undefined)?.getDate()).toBe(15);
  });

  it('steps between months', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('folds away to leave the list more room', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Collapse the month' }));

    expect(
      screen.queryByRole('button', { name: /15 September 2026|September 15, 2026/ }),
    ).toBeNull();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });
});

describe('the agenda list', () => {
  it('says what to do when there is nothing yet', () => {
    renderPanel();
    expect(within(list()).getByText(/Nothing due/)).toBeVisible();
  });

  it('files a new task under the day it is due', async () => {
    const user = userEvent.setup();
    renderPanel();

    await addTask(user, 'Read chapter 4', 0);

    expect(within(list()).getByRole('heading', { level: 4, name: 'Today' })).toBeVisible();
    expect(within(list()).getByText('Read chapter 4')).toBeVisible();
  });

  it('separates what is late from what is merely coming', async () => {
    const user = userEvent.setup();
    renderPanel();

    await addTask(user, 'Late one', -3);
    await addTask(user, 'Next week', 5);

    const headings = within(list())
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Overdue', 'Next 7 days']);
  });

  it('moves a ticked task into Done', async () => {
    const user = userEvent.setup();
    renderPanel();

    await addTask(user, 'Tick me', 0);
    await user.click(screen.getByRole('button', { name: 'Toggle Tick me' }));

    expect(within(list()).getByRole('heading', { level: 4, name: 'Done' })).toBeVisible();
    expect(within(list()).queryByRole('heading', { level: 4, name: 'Today' })).toBeNull();
  });

  it('deletes a task', async () => {
    const user = userEvent.setup();
    renderPanel();

    await addTask(user, 'Throwaway', 0);
    await user.click(screen.getByRole('button', { name: 'Delete Throwaway' }));

    expect(within(list()).queryByText('Throwaway')).toBeNull();
  });

  it('keeps the delete control reachable by keyboard', async () => {
    const user = userEvent.setup();
    renderPanel();

    await addTask(user, 'Reachable', 0);
    const remove = screen.getByRole('button', { name: 'Delete Reachable' });
    remove.focus();

    expect(remove).toHaveFocus();
  });
});

describe('what the timetable contributes', () => {
  it('lists an exam without pretending it can be ticked off', () => {
    renderPanel([exam]);

    expect(within(list()).getByText('Klausur Machine Learning')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Toggle Klausur/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete Klausur/ })).toBeNull();
  });

  it('leaves lectures out of the list entirely', () => {
    renderPanel([{ ...exam, id: 'e2', kind: 'lecture', title: 'Vorlesung' }]);

    expect(within(list()).queryByText('Vorlesung')).toBeNull();
  });

  it('offers the filter row even with only one kind present', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole('group', { name: 'Filter the list' })).toBeVisible();

    await addTask(user, 'Only a task', 0);
    expect(screen.getByRole('group', { name: 'Filter the list' })).toBeVisible();
  });

  it('says so when a filter matches nothing yet', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Exams' }));

    expect(within(list()).getByText('Nothing in this filter.')).toBeVisible();
  });

  it('narrows the list to one kind', async () => {
    const user = userEvent.setup();
    renderPanel([exam]);

    await addTask(user, 'My own task', 0);
    await user.click(screen.getByRole('button', { name: 'Exams' }));

    expect(within(list()).getByText('Klausur Machine Learning')).toBeVisible();
    expect(within(list()).queryByText('My own task')).toBeNull();
  });
});

describe('dots in the mini month', () => {
  const dayButton = (offset: number) => {
    const date = addDays(now, offset);
    const label = date.toLocaleDateString('en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return screen.getByRole('button', { name: new RegExp(`^${label}`) });
  };

  it('leaves a day of plain lectures unmarked', () => {
    renderPanel([{ ...exam, id: 'lec', kind: 'lecture', date: key(0) }]);

    expect(dayButton(0)).toHaveAccessibleName(/^\w+ \d+, \d{4}$/);
  });

  it('names an exam day, so the dot is never colour alone', () => {
    renderPanel([{ ...exam, date: key(1) }]);

    expect(dayButton(1)).toHaveAccessibleName(/, exam$/);
  });

  it('names a day that carries an open task', () => {
    useTaskStore.setState({
      tasks: [
        {
          id: 'task-1',
          title: 'Hand in the report',
          dueDate: key(2),
          dueTime: null,
          priority: 'high',
          courseCode: null,
          done: false,
        },
      ],
    });
    renderPanel();

    expect(dayButton(2)).toHaveAccessibleName(/, something due$/);
  });
});
