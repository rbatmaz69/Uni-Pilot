import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addDays, localDateKey } from '@/lib/date';
import { CalendarRightPanel } from './CalendarRightPanel';
import { useTaskStore } from '@/features/calendar/store/taskStore';
import { playDayHoverSound } from '@/features/calendar/lib/calendarSound';
import type { CalendarEvent } from '@/features/calendar/lib/types';

vi.mock('@/features/calendar/lib/calendarSound', () => ({
  playDayHoverSound: vi.fn(),
  prepareCalendarSound: vi.fn(),
}));

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
  it.each([
    [2026, 0],
    [2026, 1],
    [2026, 2],
    [2026, 3],
    [2026, 4],
    [2026, 5],
    [2026, 6],
    [2026, 7],
    [2026, 8],
    [2026, 9],
    [2026, 10],
    [2026, 11],
    [2028, 1],
  ])('shows the first seven days of the next month from %i/%i', (year, month) => {
    const focus = new Date(year, month, 15);
    render(<CalendarRightPanel focusDay={focus} onSelectDate={vi.fn()} now={focus} />);
    for (let day = 1; day <= 7; day++) {
      const date = new Date(year, month + 1, day);
      expect(
        screen.getByRole('button', {
          name: date.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
        }),
      ).toBeVisible();
    }
  });

  it('selects a next-month day before switching the displayed month', async () => {
    const onSelect = vi.fn();
    render(<CalendarRightPanel focusDay={now} onSelectDate={onSelect} now={now} />);
    const nextDate = new Date(2026, 9, 7);
    await userEvent.click(
      screen.getByRole('button', {
        name: nextDate.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(nextDate);
  });
  it('shows the month of the focused day', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'September ’26' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'October ’26' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'September ’26' })).toBeInTheDocument();
  });

  it('folds away to leave the list more room', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Collapse the month' }));

    expect(
      screen.queryByRole('button', { name: /15 September 2026|September 15, 2026/ }),
    ).toBeNull();
    expect(screen.getByRole('heading', { name: 'September ’26' })).toBeInTheDocument();
  });

  it('plays a sound when hovering over a day', async () => {
    const user = userEvent.setup();
    renderPanel();

    const dayButton = screen.getByRole('button', {
      name: /15 September 2026|September 15, 2026/,
    });
    await user.hover(dayButton);

    expect(playDayHoverSound).toHaveBeenCalledWith(15);
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
  it('reuses existing special-event artwork for the date cover', () => {
    renderPanel([
      {
        ...exam,
        kind: 'event',
        date: '2026-10-07',
        feature: { image: '/hackathon.png', category: 'Hackathon', imageHeight: 0.58 },
      },
    ]);
    const button = screen.getByRole('button', {
      name: /October 7, 2026, Klausur Machine Learning/,
    });
    expect(button.querySelector('img')).toHaveAttribute('src', '/hackathon.png');
  });
  it('lets the artwork stand in for the numeral', () => {
    renderPanel([{ ...exam, date: '2026-10-07', coverImage: '/exam.png' }]);
    const button = screen.getByRole('button', {
      name: /October 7, 2026, Klausur Machine Learning/,
    });
    expect(within(button).queryByText('7')).toBeNull();
    expect(button.querySelector('img')).toHaveAttribute('src', '/exam.png');
  });

  it('renders cover images on next-month dates, with the event in the accessible name', () => {
    renderPanel([{ ...exam, date: '2026-10-07', coverImage: '/exam.png' }]);
    const button = screen.getByRole('button', {
      name: /October 7, 2026, Klausur Machine Learning, exam/,
    });
    expect(button.querySelector('img')).toHaveAttribute('src', '/exam.png');
    const image = button.querySelector('img')!;
    fireEvent.error(image);
    expect(button.querySelector('img')).toBeNull();
    expect(within(button).getByText('7')).toBeVisible();
  });

  it('prioritises exam covers and excludes cancelled events on a shared date', () => {
    renderPanel([
      {
        ...exam,
        id: 'cancelled',
        date: '2026-10-07',
        status: 'cancelled',
        coverImage: '/cancelled.png',
      },
      { ...exam, id: 'lecture', date: '2026-10-07', kind: 'lecture', coverImage: '/lecture.png' },
      { ...exam, date: '2026-10-07', coverImage: '/exam.png' },
    ]);
    const button = screen.getByRole('button', {
      name: /October 7, 2026, Klausur Machine Learning, exam/,
    });
    expect(button.querySelector('img')).toHaveAttribute('src', '/exam.png');
  });
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

  it('shows an exam indicator during the first week of next month', () => {
    renderPanel([{ ...exam, date: '2026-10-07' }]);
    expect(dayButton(9)).toHaveAccessibleName(/, exam$/);
    expect(dayButton(9).querySelector('[aria-hidden]')).toBeInTheDocument();
  });

  it('also marks dates carried over from the previous month', () => {
    renderPanel([{ ...exam, date: '2026-08-31' }]);
    expect(dayButton(-28)).toHaveAccessibleName(/, exam$/);
  });

  it('marks next-month tasks and ignores cancelled exams', () => {
    useTaskStore.setState({
      tasks: [
        {
          id: 'next-month-task',
          title: 'Prepare presentation',
          dueDate: '2026-10-06',
          dueTime: null,
          priority: 'med',
          courseCode: null,
          done: false,
        },
      ],
    });
    renderPanel([{ ...exam, date: '2026-10-07', status: 'cancelled' }]);
    expect(dayButton(8)).toHaveAccessibleName(/, something due$/);
    expect(dayButton(9)).not.toHaveAccessibleName(/exam/);
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
