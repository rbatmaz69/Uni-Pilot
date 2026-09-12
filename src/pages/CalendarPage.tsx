import { CalendarWorkspace } from '@/features/calendar';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';

export function CalendarPage() {
  return (
    <Page item={NAV_ITEMS.calendar} hideHeader>
      <h1 className="sr-only">{NAV_ITEMS.calendar.label}</h1>
      <span className="sr-only">{NAV_ITEMS.calendar.subtitle}</span>
      <CalendarWorkspace />
    </Page>
  );
}
