import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';

/**
 * Empty on purpose: the demo widgets that stood here were placeholders with
 * made-up data. Widgets come back one at a time, each backed by real data.
 */
export function DashboardPage() {
  return <Page item={NAV_ITEMS.dashboard} />;
}
