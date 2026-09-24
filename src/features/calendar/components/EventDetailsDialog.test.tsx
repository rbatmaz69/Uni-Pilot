import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { EventDetailsDialog } from './EventDetailsDialog';

const NOW = new Date('2026-09-23T10:00:00');

/** A deadline as an ILIAS calendar feed delivers it, deep link included. */
const ILIAS_DEADLINE: CalendarEvent = {
  id: 'ilias:1',
  sourceId: 'ilias',
  title: 'Abgabe Blatt 3',
  kind: 'deadline',
  tone: 'blue',
  date: '2026-09-29',
  startTime: '23:59',
  endTime: '23:59',
  status: 'confirmed',
  url: 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711',
};

/** A timetable entry from splan, which carries no link. */
const SPLAN_LECTURE: CalendarEvent = {
  id: 'splan:1',
  sourceId: 'splan',
  title: 'Ausgewählte Kapitel des Software Engineering',
  kind: 'lecture',
  tone: 'green',
  date: '2026-09-29',
  startTime: '11:30',
  endTime: '13:00',
  status: 'confirmed',
  courseCode: '262164',
};

const renderDialog = (event: CalendarEvent) =>
  render(
    <MemoryRouter>
      <EventDetailsDialog
        event={event}
        now={NOW}
        sourceName="ilias.hs-heilbronn.de"
        onClose={() => undefined}
        onRemove={() => undefined}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-23T10:00:00.000Z',
    },
  });
});

describe('an entry that links into ILIAS', () => {
  it('offers to open it there', () => {
    renderDialog(ILIAS_DEADLINE);
    expect(screen.getByRole('button', { name: 'Open in ILIAS' })).toBeInTheDocument();
  });

  it('offers nothing while ILIAS is not connected', () => {
    useIliasStore.setState({ connection: null });
    renderDialog(ILIAS_DEADLINE);
    expect(screen.queryByRole('button', { name: 'Open in ILIAS' })).not.toBeInTheDocument();
  });
});

describe('a timetable entry', () => {
  it('stays as it was — no link, no button', () => {
    renderDialog(SPLAN_LECTURE);
    expect(screen.queryByRole('button', { name: 'Open in ILIAS' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
