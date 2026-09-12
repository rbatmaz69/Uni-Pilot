import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, formatDayLabel, formatWeekRange, localDateKey, startOfWeek } from '@/lib/date';
import { NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';
import { seedTestSource } from '@/features/calendar/lib/testFeed';

/**
 * The schedule is generated around whatever day the suite runs on, so every
 * expectation is derived the same way rather than pinned to a fixed date.
 */
const today = new Date();
const monday = startOfWeek(today);
const wednesday = addDays(monday, 2);
const thursday = addDays(monday, 3);

/** Every test starts from a subscribed timetable; there is no built-in data. */
const openCalendar = () => {
  seedTestSource();
  return renderApp(NAV_ITEMS.calendar.path);
};
const grid = () => screen.getByRole('region', { name: 'Week schedule' });
const dialog = () => screen.getByRole('dialog');
// Scoped because the right-hand agenda panel also offers an "Exams" pill.
const eventFilters = () => within(screen.getByRole('region', { name: 'Event filters' }));

describe('Calendar, week view', () => {
  it('opens on the current week', () => {
    openCalendar();

    expect(screen.getByRole('heading', { level: 2, name: formatWeekRange(monday) })).toBeVisible();
    expect(screen.getByText(/This week/)).toBeVisible();
  });

  it('lays the recurring timetable onto the right days', () => {
    openCalendar();

    expect(
      within(grid()).getByRole('button', {
        name: new RegExp(
          `^Ausgewählte Kapitel des Software Engineering, Lecture, ${formatDayLabel(monday)}`,
        ),
      }),
    ).toBeVisible();
  });

  it('pins a deadline above the time axis instead of on it', async () => {
    const user = userEvent.setup();
    openCalendar();
    await user.click(screen.getByRole('button', { name: 'Next week' }));

    expect(
      within(grid()).getByRole('button', {
        name: `Abgabe Projektbericht, Deadline, ${formatDayLabel(addDays(monday, 9))} at 23:59`,
      }),
    ).toBeVisible();
  });

  it('marks a cancelled lecture as such for screen readers too', () => {
    openCalendar();

    expect(
      within(grid()).getByRole('button', {
        name: /^Recht der Informationstechnologie,.*Cancelled$/,
      }),
    ).toBeVisible();
  });

  it('steps a week forwards and back again', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(
      screen.getByRole('heading', { level: 2, name: formatWeekRange(addDays(monday, 7)) }),
    ).toBeVisible();
    expect(screen.getByText(/Next week/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 2, name: formatWeekRange(monday) })).toBeVisible();
  });

  it('moves between weeks with the arrow keys', () => {
    openCalendar();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(
      screen.getByRole('heading', { level: 2, name: formatWeekRange(addDays(monday, 7)) }),
    ).toBeVisible();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { level: 2, name: formatWeekRange(monday) })).toBeVisible();
  });
});

describe('Calendar, day view', () => {
  it('opens a single day from its column header', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: `Show ${formatDayLabel(wednesday)}` }));

    expect(
      screen.getByRole('heading', { level: 2, name: formatDayLabel(wednesday) }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('region', { name: 'Day schedule' }).querySelectorAll('[role]'),
    ).toBeDefined();
  });

  it('drops the other days of the week', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: `Show ${formatDayLabel(monday)}` }));

    // Monday's lecture stays; Thursday's cancelled one is out of view.
    expect(
      screen.getByRole('button', { name: /^Ausgewählte Kapitel des Software Engineering,/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Recht der Informationstechnologie,/ }),
    ).toBeNull();
  });

  it('returns to the week with the keyboard', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: `Show ${formatDayLabel(wednesday)}` }));
    fireEvent.keyDown(window, { key: 'w' });

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: formatWeekRange(monday) })).toBeVisible();
  });
});

describe('Calendar filters', () => {
  it('narrows the grid to one kind of entry', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(eventFilters().getByRole('button', { name: /^Exams/ }));

    expect(screen.getByRole('button', { name: /^Klausur Machine Learning,/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Ausgewählte Kapitel des Software Engineering,/ }),
    ).toBeNull();
  });

  it('explains an empty grid caused by filtering', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(eventFilters().getByRole('button', { name: /^Exams/ }));
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    await user.click(screen.getByRole('button', { name: 'Next week' }));

    expect(screen.getByText('Nothing matches these filters')).toBeVisible();
    // The chip has to survive the trip, or there is nothing left to switch off.
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    expect(eventFilters().getByRole('button', { name: /^Exams/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores everything through the All chip', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(eventFilters().getByRole('button', { name: /^Exams/ }));
    await user.click(eventFilters().getByRole('button', { name: 'All' }));

    expect(
      screen.getByRole('button', { name: /^Ausgewählte Kapitel des Software Engineering,/ }),
    ).toBeVisible();
    expect(eventFilters().getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('Calendar event details', () => {
  it('opens the details of an event', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: /^Klausur Machine Learning,/ }));

    const panel = within(dialog());
    expect(panel.getByRole('heading', { name: 'Klausur Machine Learning' })).toBeVisible();
    expect(panel.getByText(formatDayLabel(thursday), { exact: false })).toBeVisible();
    expect(panel.getByText('Aula')).toBeVisible();
  });

  it('closes on Escape and hands focus back', async () => {
    const user = userEvent.setup();
    openCalendar();

    const card = screen.getByRole('button', { name: /^Klausur Machine Learning,/ });
    await user.click(card);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(card).toHaveFocus();
  });

  it('removes an event this app owns', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: 'New event' }));
    const composer = within(dialog());
    await user.type(composer.getByLabelText('Title'), 'Coffee with Nora');
    fireEvent.change(composer.getByLabelText('Date'), {
      target: { value: localDateKey(wednesday) },
    });
    await user.click(composer.getByRole('button', { name: 'Add to calendar' }));

    await user.click(screen.getByRole('button', { name: /^Coffee with Nora,/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Remove' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Coffee with Nora,/ })).toBeNull();
  });

  it('will not offer to delete something a subscription owns', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: /^Klausur Machine Learning,/ }));

    expect(within(dialog()).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(dialog()).getByText(/From Stundenplan SEB6/)).toBeVisible();
  });
});

describe('Calendar composer', () => {
  const openComposer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: 'New event' }));
    return within(dialog());
  };

  it('starts on the first field rather than the close button', async () => {
    const user = userEvent.setup();
    openCalendar();

    const panel = await openComposer(user);
    expect(panel.getByLabelText('Title')).toHaveFocus();
  });

  it('adds an event to the day in view', async () => {
    const user = userEvent.setup();
    openCalendar();

    const panel = await openComposer(user);
    await user.type(panel.getByLabelText('Title'), 'Thesis kick-off');
    fireEvent.change(panel.getByLabelText('Date'), { target: { value: localDateKey(wednesday) } });
    fireEvent.change(panel.getByLabelText('Starts'), { target: { value: '16:00' } });
    fireEvent.change(panel.getByLabelText('Ends'), { target: { value: '17:00' } });
    await user.click(panel.getByRole('button', { name: 'Add to calendar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `Thesis kick-off, Lecture, ${formatDayLabel(wednesday)}, 16:00 to 17:00`,
      }),
    ).toBeVisible();
  });

  it('keeps the length of the event when the start moves', async () => {
    const user = userEvent.setup();
    openCalendar();

    const panel = await openComposer(user);
    expect(panel.getByLabelText('Ends')).toHaveValue('10:30');

    fireEvent.change(panel.getByLabelText('Starts'), { target: { value: '14:00' } });
    expect(panel.getByLabelText('Ends')).toHaveValue('15:30');
  });

  it('refuses an end that comes before the start', async () => {
    const user = userEvent.setup();
    openCalendar();

    const panel = await openComposer(user);
    await user.type(panel.getByLabelText('Title'), 'Backwards');
    fireEvent.change(panel.getByLabelText('Ends'), { target: { value: '08:00' } });
    await user.click(panel.getByRole('button', { name: 'Add to calendar' }));

    expect(panel.getByRole('alert')).toHaveTextContent('end time has to come after');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('asks for a name before saving', async () => {
    const user = userEvent.setup();
    openCalendar();

    const panel = await openComposer(user);
    await user.click(panel.getByRole('button', { name: 'Add to calendar' }));

    expect(panel.getByRole('alert')).toHaveTextContent('Give the event a name');
  });

  it('drops a filter that would hide what was just created', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(eventFilters().getByRole('button', { name: /^Exams/ }));
    const panel = await openComposer(user);
    await user.type(panel.getByLabelText('Title'), 'Reading group');
    fireEvent.change(panel.getByLabelText('Date'), { target: { value: localDateKey(wednesday) } });
    await user.click(panel.getByRole('button', { name: 'Add to calendar' }));

    expect(screen.getByRole('button', { name: /^Reading group,/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    expect(eventFilters().getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers a day header shortcut that prefills that day', async () => {
    const user = userEvent.setup();
    openCalendar();

    await user.click(
      screen.getByRole('button', { name: `Add an event on ${formatDayLabel(thursday)}` }),
    );

    expect(within(dialog()).getByLabelText('Date')).toHaveValue(localDateKey(thursday));
  });
});

describe('Calendar, weekday labels', () => {
  it('shows Monday through Friday without weekend columns', () => {
    openCalendar();

    for (let index = 0; index < 5; index += 1) {
      const day = addDays(monday, index);
      expect(screen.getByRole('button', { name: `Show ${formatDayLabel(day)}` })).toBeVisible();
    }
    for (const index of [5, 6]) {
      const day = addDays(monday, index);
      expect(screen.queryByRole('button', { name: `Show ${formatDayLabel(day)}` })).toBeNull();
    }
  });
});
