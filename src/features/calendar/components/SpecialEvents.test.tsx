import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarRightPanel } from './CalendarRightPanel';
import { EventComposerDialog } from './EventComposerDialog';
import { EventDetailsDialog } from './EventDetailsDialog';
import { FUTURE_CITY_HACKATHON } from '@/features/calendar/lib/specialEvents';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { useUiStore } from '@/store/uiStore';
import { SpecialEventsSection } from './SpecialEventsSection';

const now = new Date(2026, 8, 13);

describe('Student event cards', () => {
  it('remembers a collapsed section after rehydration and lets the user expand it again', async () => {
    const user = userEvent.setup();
    render(<SpecialEventsSection events={[FUTURE_CITY_HACKATHON]} now={now} onSelect={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Beyond the classroom' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Future City Hackathon/ })).toBeNull();
    const saved = localStorage.getItem('uni-pilot.ui')!;
    await act(async () => {
      useUiStore.setState({ studentEventsCollapsed: false });
      localStorage.setItem('uni-pilot.ui', saved);
      await useUiStore.persist.rehydrate();
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Future City Hackathon/ })).toBeVisible();
  });

  it('puts later events below the agenda, without a category badge, and opens the event', async () => {
    const onSelect = vi.fn();
    render(
      <CalendarRightPanel
        focusDay={now}
        now={now}
        onSelectDate={vi.fn()}
        events={[FUTURE_CITY_HACKATHON]}
        onSelectEvent={onSelect}
      />,
    );
    const section = screen.getByRole('region', { name: 'Student events' });
    const agenda = screen.getByRole('region', { name: 'Tasks and deadlines' });
    expect(agenda.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getByText('Later')).toBeVisible();
    expect(within(section).queryByText('Hackathon', { exact: true })).toBeNull();
    await userEvent.click(
      within(section).getByRole('button', { name: /Future City Hackathon.*13 November 2026/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(FUTURE_CITY_HACKATHON);
  });

  it('does not invent a start time or offer time-based reminders for the saved date', () => {
    render(
      <EventDetailsDialog
        event={FUTURE_CITY_HACKATHON}
        now={now}
        sourceName={null}
        onClose={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Due at|00:00|23:59/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Reminders' })).toBeNull();
  });

  it('creates another special event with an unannounced time', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EventComposerDialog
        draft={{ date: '2026-11-13', startTime: '09:00' }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('Title'), 'Student meetup');
    await user.selectOptions(screen.getByLabelText('Type'), 'event');
    await user.click(screen.getByLabelText('Time to be announced'));
    expect(screen.queryByLabelText('Starts')).toBeNull();
    fireEvent.change(screen.getByLabelText('Event category'), { target: { value: 'Meetup' } });
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Student meetup',
        kind: 'event',
        date: '2026-11-13',
        allDay: true,
        feature: { image: '', category: 'Meetup', timeUnannounced: true },
      }),
    );
  });
});

describe('Requested hackathon persistence', () => {
  it('migrates existing calendars once and respects removal after reload', async () => {
    localStorage.setItem(
      'uni-pilot.calendar-events',
      JSON.stringify({ state: { events: [] }, version: 0 }),
    );
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events).toEqual([FUTURE_CITY_HACKATHON]);
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events).toHaveLength(1);
    useEventStore.getState().remove(FUTURE_CITY_HACKATHON.id);
    await useEventStore.persist.rehydrate();
    expect(useEventStore.getState().events).toEqual([]);
  });
});
