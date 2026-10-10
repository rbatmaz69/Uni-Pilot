import {
  Bookmark,
  CalendarDays,
  Code2,
  Compass,
  GraduationCap,
  Landmark,
  Layers,
  Map as MapIcon,
  MapPin,
  Globe2,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORIES } from '@/features/events/lib/events';

/** The three lists the Events panel switches between. */
export type Collection = 'discover' | 'saved' | 'mine';

export const COLLECTIONS: readonly {
  id: Collection;
  label: string;
  icon: LucideIcon;
  /** One quiet line under the collection's name in the card. */
  blurb: string;
}[] = [
  {
    id: 'discover',
    label: 'Discover',
    icon: Compass,
    blurb: 'Hackathons, workshops and meetups for students.',
  },
  { id: 'saved', label: 'Saved', icon: Bookmark, blurb: 'The events you bookmarked for later.' },
  {
    id: 'mine',
    label: 'My events',
    icon: CalendarDays,
    blurb: 'Events in your calendar and ones you created.',
  },
];

/** A category chip or panel row: one of the event categories, or all of them. */
export type CategoryFilter = (typeof CATEGORIES)[number];

export const CATEGORY_ICONS: Record<CategoryFilter, LucideIcon> = {
  'All events': Layers,
  Hackathons: Code2,
  Workshops: Sparkles,
  Career: GraduationCap,
  Meetups: Users,
  'Campus life': Landmark,
};

/** Where an event takes place. */
export type Format = 'all' | 'in-person' | 'online';

export const FORMATS: readonly { id: Format; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All locations', icon: MapIcon },
  { id: 'in-person', label: 'In person', icon: MapPin },
  { id: 'online', label: 'Online', icon: Globe2 },
];
