import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventsExperience } from '@/features/events/components/EventsExperience';
import { useDiscoveryStore } from '@/features/events/store/discoveryStore';
import { renderApp } from '@/test/render';
import { STUDENT_EVENTS, toCalendarEvent } from '@/features/events/lib/events';
import { useEventStore } from '@/features/calendar/store/eventStore';

beforeEach(() => useDiscoveryStore.setState({ savedIds: [], createdEvents: [] }));
function renderEvents() {
  return render(
    <MemoryRouter>
      <EventsExperience />
    </MemoryRouter>,
  );
}
const listings = () => within(screen.getByRole('region', { name: 'Browse student events' }));

describe('student event discovery', () => {
  it('combines category, search, format, and date filters with a recoverable empty state', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(screen.getByRole('button', { name: 'Hackathons' }));
    expect(listings().getAllByRole('article')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.selectOptions(screen.getByLabelText('Event format'), 'online');
    expect(listings().getAllByRole('article')).toHaveLength(1);
    await user.type(screen.getByRole('textbox', { name: 'Search events' }), 'unmatched');
    expect(screen.getByText('No events here just yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Explore all events' }));
    await user.click(
      screen.getByRole('button', { name: 'Saturday, 14 November 2026, events available' }),
    );
    expect(listings().getAllByRole('article')).toHaveLength(1);
    expect(
      listings().getByRole('heading', { name: 'Build your first AI side project' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear date filter' }));
    expect(listings().getAllByRole('article')).toHaveLength(6);
  });
  it('keeps saved events after remount and removes them when unbookmarked', async () => {
    const user = userEvent.setup();
    const page = renderEvents();
    await user.click(screen.getByRole('button', { name: 'Save Build your first AI side project' }));
    page.unmount();
    renderEvents();
    await user.click(screen.getByRole('tab', { name: 'Saved 1' }));
    expect(listings().getAllByRole('article')).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: 'Unsave Build your first AI side project' }),
    );
    expect(screen.getByText('Keep a little inspiration for later.')).toBeInTheDocument();
  });
  it.each([
    ['Future City Hackathon', 'future-city-hackathon-2026'],
    ['Build your first AI side project', 'sample-ai-build'],
  ])('adds %s and shows its day in the calendar, including weekends', async (title, id) => {
    const user = userEvent.setup();
    const app = renderApp('/events');
    await user.click(screen.getByRole('button', { name: `View ${title}` }));
    await user.click(screen.getByRole('button', { name: 'Add to my calendar' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Calendar');
    const day = within(screen.getByRole('region', { name: 'Day schedule' }));
    expect(day.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    expect(useEventStore.getState().events).toHaveLength(1);
    expect(useEventStore.getState().events[0]?.id).toBe(id);
    if (id === 'future-city-hackathon-2026') {
      expect(useEventStore.getState().events[0]).toMatchObject({
        allDay: true,
        feature: { timeUnannounced: true },
      });
    }
    // Returning to a saved calendar link must still land on the event after remount.
    app.unmount();
    renderApp(`/calendar?event=${id}`);
    expect(
      within(screen.getByRole('region', { name: 'Day schedule' })).getByRole('button', {
        name: new RegExp(title),
      }),
    ).toBeInTheDocument();
  });
  it('opens an already-added event without creating a duplicate', async () => {
    const event = STUDENT_EVENTS[0]!;
    useEventStore.getState().add(toCalendarEvent(event));
    const user = userEvent.setup();
    renderApp('/events');
    await user.click(screen.getByRole('button', { name: `View ${event.title}` }));
    const open = screen.getByRole('button', { name: 'View in calendar' });
    expect(open).toBeEnabled();
    await user.click(open);
    expect(
      within(screen.getByRole('region', { name: 'Day schedule' })).getByRole('button', {
        name: /Future City Hackathon/,
      }),
    ).toBeInTheDocument();
    expect(useEventStore.getState().events).toHaveLength(1);
  });
  it('falls back to the normal calendar for an unknown event link', () => {
    renderApp('/calendar?event=missing-event');
    expect(screen.getByRole('region', { name: 'Week schedule' })).toBeInTheDocument();
  });
  it('creates a local event, validates time, and can add it to the calendar', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Event name'), 'Robotics study jam');
    await user.type(dialog.getByLabelText('Hosted by'), 'Robotics Society');
    fireEvent.change(dialog.getByLabelText('Date'), { target: { value: '2099-11-22' } });
    fireEvent.change(dialog.getByLabelText('Ends'), { target: { value: '15:00' } });
    await user.type(dialog.getByLabelText('Location or meeting link'), 'Lab 4');
    await user.type(dialog.getByLabelText('About the event'), 'Build a small robot together.');
    await user.click(dialog.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('alert')).toHaveTextContent('end time after the start time');
    fireEvent.change(dialog.getByLabelText('Ends'), { target: { value: '18:00' } });
    await user.click(dialog.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('dialog', { name: 'Robotics study jam' })).toBeInTheDocument();
    expect(useDiscoveryStore.getState().createdEvents[0]).toMatchObject({
      title: 'Robotics study jam',
      location: 'Lab 4',
      date: '2099-11-22',
    });
    await user.click(screen.getByRole('button', { name: 'Add to my calendar' }));
    expect(useEventStore.getState().events[0]).toMatchObject({
      title: 'Robotics study jam',
      room: 'Lab 4',
    });
  });
  it('supports keyboard navigation between event collections', async () => {
    const user = userEvent.setup();
    renderEvents();
    screen.getByRole('tab', { name: 'Discover' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Saved 0' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Saved 0' })).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
  });
  it('switches to the timeline and sorts the same filtered events', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(screen.getByRole('button', { name: 'Timeline view' }));
    expect(screen.getByRole('button', { name: 'Timeline view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.selectOptions(screen.getByLabelText('Sort events'), 'latest');
    expect(within(listings().getAllByRole('article')[0]!).getByRole('heading')).toHaveTextContent(
      'A little break, a few new friends',
    );
  });
});
