import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatWeekRange, localDateKey, startOfWeek } from '@/lib/date';
import { NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';
import { useSourceStore } from '@/features/calendar/store/sourceStore';

const monday = startOfWeek(new Date());
const stamp = (date: Date, time: string) => `${localDateKey(date).replace(/-/g, '')}T${time}`;

/** A feed shaped like a real timetable export, anchored on the current week. */
const timetable = (summary = 'Verteilte Systeme Vorlesung') =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-CALNAME:Stundenplan Informatik',
    'BEGIN:VEVENT',
    'UID:vs-lecture',
    `SUMMARY:${summary}`,
    'LOCATION:Raum B 201',
    `DTSTART:${stamp(addDays(monday, 1), '100000')}`,
    `DTEND:${stamp(addDays(monday, 1), '113000')}`,
    'RRULE:FREQ=WEEKLY;COUNT=12',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

const openSources = async (user: ReturnType<typeof userEvent.setup>) => {
  renderApp(NAV_ITEMS.calendar.path);
  await user.click(screen.getByRole('button', { name: 'Calendar options' }));
  await user.click(screen.getByRole('button', { name: /^Sources/ }));
  return within(screen.getByRole('dialog'));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Subscribing to a calendar link', () => {
  it('fetches the feed and puts it on the grid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(timetable(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    expect(await panel.findByRole('status')).toHaveTextContent('Stundenplan Informatik');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://campus.example.edu/plan.ics',
      expect.anything(),
    );

    await user.click(panel.getByRole('button', { name: 'Done' }));
    expect(
      await screen.findByRole('button', { name: /^Verteilte Systeme Vorlesung,/ }),
    ).toBeVisible();
  });

  it('moves to the first week the timetable covers', async () => {
    const future = addDays(monday, 28);
    const semester = [
      'BEGIN:VCALENDAR',
      'X-WR-CALNAME:Wintersemester',
      'BEGIN:VEVENT',
      'UID:later',
      'SUMMARY:Vorlesung im nächsten Monat',
      `DTSTART:${stamp(future, '100000')}`,
      `DTEND:${stamp(future, '113000')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(semester, { status: 200 })));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/ws.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));
    await panel.findByRole('status');
    await user.click(panel.getByRole('button', { name: 'Done' }));

    // Landing on an empty current week would read as a failed import.
    expect(
      await screen.findByRole('button', { name: /^Vorlesung im nächsten Monat,/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: formatWeekRange(startOfWeek(future)) }),
    ).toBeVisible();
  });

  it('turns a webcal address into something fetchable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(timetable(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(
      panel.getByLabelText('Subscribe to a link'),
      'webcal://campus.example.edu/plan.ics',
    );
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://campus.example.edu/plan.ics');
  });

  it('explains a page that is not a calendar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Login</html>')));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'example.edu/login');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('returned a page rather than');
  });

  it('explains a blocked request instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('desktop app');
  });

  it('reports a 404 in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/gone.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('404');
  });

  it('refuses the same link twice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(timetable(), { status: 200 })));
    const user = userEvent.setup();

    const panel = await openSources(user);
    const field = panel.getByLabelText('Subscribe to a link');
    await user.type(field, 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));
    await panel.findByRole('status');

    await user.type(field, 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('already on the list');
  });

  it('keeps the cached events when a refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(timetable(), { status: 200 })));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));
    await panel.findByRole('status');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await user.click(panel.getByRole('button', { name: /^Refresh/ }));

    await waitFor(() => expect(useSourceStore.getState().sources[0]?.error).toBeTruthy());
    expect(useSourceStore.getState().sources[0]?.events.length).toBeGreaterThan(0);
  });

  it('drops the events again when the source is removed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(timetable(), { status: 200 })));
    const user = userEvent.setup();

    const panel = await openSources(user);
    await user.type(panel.getByLabelText('Subscribe to a link'), 'campus.example.edu/plan.ics');
    await user.click(panel.getByRole('button', { name: 'Subscribe' }));
    await panel.findByRole('status');
    await user.click(panel.getByRole('button', { name: /^Remove Stundenplan/ }));
    await user.click(panel.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('button', { name: /^Verteilte Systeme/ })).toBeNull();
  });
});

describe('Importing an .ics file', () => {
  it('reads the file and shows its events', async () => {
    const user = userEvent.setup();
    const panel = await openSources(user);

    await user.upload(
      panel.getByLabelText('Import a file'),
      new File([timetable('Praktikum Rechnernetze')], 'stundenplan.ics', {
        type: 'text/calendar',
      }),
    );

    expect(await panel.findByRole('status')).toHaveTextContent('Stundenplan Informatik');
    await user.click(panel.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: /^Praktikum Rechnernetze,/ })).toBeVisible();
  });

  it('rejects a file that holds no events', async () => {
    const user = userEvent.setup();
    const panel = await openSources(user);

    await user.upload(
      panel.getByLabelText('Import a file'),
      new File(['BEGIN:VCALENDAR\r\nEND:VCALENDAR'], 'empty.ics', { type: 'text/calendar' }),
    );

    expect(await panel.findByRole('alert')).toHaveTextContent('no events');
  });
});

describe('Imported events are read-only', () => {
  it('names the source instead of offering a delete button', async () => {
    const user = userEvent.setup();
    const panel = await openSources(user);

    await user.upload(
      panel.getByLabelText('Import a file'),
      new File([timetable()], 'stundenplan.ics', { type: 'text/calendar' }),
    );
    await panel.findByRole('status');
    await user.click(panel.getByRole('button', { name: 'Done' }));

    await user.click(await screen.findByRole('button', { name: /^Verteilte Systeme/ }));
    const details = within(screen.getByRole('dialog'));

    expect(details.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(details.getByText(/From Stundenplan Informatik/)).toBeVisible();
  });
});

describe('An empty calendar', () => {
  it('offers the one useful next step', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.calendar.path);

    expect(screen.getByText('Nothing scheduled')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add your timetable' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Subscribe to a link')).toBeVisible();
  });
});
