import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventsExperience } from '@/features/events/components/EventsExperience';
import { useDiscoveryStore } from '@/features/events/store/discoveryStore';
import { renderApp } from '@/test/render';
import { STUDENT_EVENTS, toCalendarEvent } from '@/features/events/lib/events';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useUiStore } from '@/store/uiStore';

beforeEach(() => useDiscoveryStore.setState({ savedIds: [], createdEvents: [] }));
function renderEvents() {
  return render(
    <MemoryRouter>
      <EventsExperience />
    </MemoryRouter>,
  );
}
const listings = () => within(screen.getByRole('region', { name: 'Browse student events' }));
/** The Events panel: portaled into the shell's slot, or in place when the page renders on its own. */
const panel = () => within(screen.getByRole('complementary', { name: 'Events' }));
const hidePanel = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: 'Hide sidebar' }));

describe('student event discovery', () => {
  it('combines category, search, format, and date filters with a recoverable empty state', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(panel().getByRole('button', { name: 'Hackathons' }));
    expect(listings().getAllByRole('article')).toHaveLength(2);
    await user.click(panel().getByRole('button', { name: 'Online' }));
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
    await user.click(panel().getByRole('button', { name: 'Saved 1' }));
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
  it('switches collections from the panel, with counts in the names', async () => {
    useDiscoveryStore.setState({ savedIds: ['sample-ai-build', 'sample-career'] });
    const user = userEvent.setup();
    renderEvents();
    expect(panel().getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(panel().getByRole('button', { name: 'Discover' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(panel().getByRole('button', { name: 'My events' })).toBeInTheDocument();

    await user.click(panel().getByRole('button', { name: 'Saved 2' }));
    expect(panel().getByRole('button', { name: 'Saved 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(panel().getByRole('button', { name: 'Discover' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Saved', level: 2 })).toBeInTheDocument();
    expect(listings().getAllByRole('article')).toHaveLength(2);

    await user.click(panel().getByRole('button', { name: 'Discover' }));
    expect(listings().getAllByRole('article')).toHaveLength(6);
  });
  it('can be reached with the keyboard alone', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.tab();
    expect(panel().getByRole('button', { name: 'Create event' })).toHaveFocus();
    await user.tab();
    expect(panel().getByRole('button', { name: 'Discover' })).toHaveFocus();
    await user.tab();
    expect(panel().getByRole('button', { name: 'Saved' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(panel().getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-current', 'true');
  });
  it('clears filters when the collection changes, as before', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(panel().getByRole('button', { name: 'Hackathons' }));
    await user.click(panel().getByRole('button', { name: 'Online' }));
    await user.type(screen.getByRole('textbox', { name: 'Search events' }), 'open');
    expect(listings().getAllByRole('article')).toHaveLength(1);

    await user.click(panel().getByRole('button', { name: 'My events' }));
    await user.click(panel().getByRole('button', { name: 'Discover' }));
    expect(panel().getByRole('button', { name: 'All events' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(panel().getByRole('button', { name: 'All locations' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Search events' })).toHaveValue('');
    expect(listings().getAllByRole('article')).toHaveLength(6);
  });
  it('resets every filter from the results line', async () => {
    const user = userEvent.setup();
    renderEvents();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: 'Career' }));
    expect(listings().getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(listings().getAllByRole('article')).toHaveLength(6);
    expect(panel().getByRole('button', { name: 'All events' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
  it('suggests a first event when My events is empty', async () => {
    const user = userEvent.setup();
    renderEvents();
    await user.click(panel().getByRole('button', { name: 'My events' }));
    expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create an event' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('lists the calendar and created events under My events, with a count', async () => {
    useEventStore.getState().add(toCalendarEvent(STUDENT_EVENTS[0]!));
    const user = userEvent.setup();
    renderEvents();
    await user.click(panel().getByRole('button', { name: 'My events 1' }));
    expect(listings().getAllByRole('article')).toHaveLength(1);
  });
  it('shows no second "Create event" button while the panel is there', () => {
    renderEvents();
    expect(screen.getAllByRole('button', { name: 'Create event' })).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Event collections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Event category' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Event format')).not.toBeInTheDocument();
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

describe('the Events panel in the shell', () => {
  it('sits between the rail and the card and names the section', () => {
    renderApp('/events');
    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    const events = screen.getByRole('complementary', { name: 'Events' });
    const main = screen.getByRole('main');
    expect(rail.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(events.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Events');
  });
  it('creates an event from the panel, and only from there', async () => {
    const user = userEvent.setup();
    renderApp('/events');
    expect(screen.getAllByRole('button', { name: 'Create event' })).toHaveLength(1);
    await user.click(panel().getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('keeps every choice in the card while the panel is hidden, and nothing twice', async () => {
    const user = userEvent.setup();
    renderApp('/events');
    await hidePanel(user);
    expect(screen.queryByRole('complementary', { name: 'Events' })).not.toBeInTheDocument();

    const collections = within(screen.getByRole('group', { name: 'Event collections' }));
    expect(collections.getByRole('button', { name: 'Discover' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(collections.getByRole('button', { name: 'My events' }));
    expect(collections.getByRole('button', { name: 'My events' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'My events', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create event' })).toHaveLength(1);

    await user.click(
      within(screen.getByRole('group', { name: 'Event category' })).getByRole('button', {
        name: 'Career',
      }),
    );
    await user.click(collections.getByRole('button', { name: 'Discover' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Event category' })).getByRole('button', {
        name: 'Hackathons',
      }),
    );
    await user.selectOptions(screen.getByLabelText('Event format'), 'online');
    expect(listings().getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(listings().getAllByRole('article')).toHaveLength(6);
  });
  it('carries the choice over when the panel comes back', async () => {
    useDiscoveryStore.setState({ savedIds: ['sample-career'] });
    const user = userEvent.setup();
    renderApp('/events');
    await user.click(panel().getByRole('button', { name: 'Saved 1' }));
    await hidePanel(user);
    expect(
      within(screen.getByRole('group', { name: 'Event collections' })).getByRole('button', {
        name: 'Saved 1',
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(panel().getByRole('button', { name: 'Saved 1' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.queryByRole('group', { name: 'Event collections' })).not.toBeInTheDocument();
    expect(listings().getAllByRole('article')).toHaveLength(1);
  });
  it('starts without the panel when the student has hidden it before', () => {
    useUiStore.setState({ panelOpen: false });
    renderApp('/events');
    expect(screen.queryByRole('complementary', { name: 'Events' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Event collections' })).toBeInTheDocument();
  });
});
