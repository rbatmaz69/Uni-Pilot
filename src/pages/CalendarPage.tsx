import { useSearchParams } from 'react-router-dom';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { CalendarWorkspace } from '@/features/calendar';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';

export function CalendarPage() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const initialEvent = useEventStore((state) => state.events.find((event) => event.id === eventId));
  return (
    <Page item={NAV_ITEMS.calendar} hideHeader fill>
      <h1 className="sr-only">{NAV_ITEMS.calendar.label}</h1>
      <span className="sr-only">{NAV_ITEMS.calendar.subtitle}</span>
      <CalendarWorkspace key={eventId ?? 'default'} initialEvent={initialEvent} />
    </Page>
  );
}
