import { Plus } from 'lucide-react';
import {
  PanelAction,
  PanelBody,
  PanelHeader,
  PanelItem,
  PanelSection,
} from '@/components/layout/Panel';
import { SectionPanel } from '@/components/layout/SectionPanel';
import {
  CATEGORY_ICONS,
  COLLECTIONS,
  FORMATS,
  type CategoryFilter,
  type Collection,
  type Format,
} from '@/features/events/lib/collections';
import { CATEGORIES } from '@/features/events/lib/events';

interface EventsPanelProps {
  collection: Collection;
  onCollection: (collection: Collection) => void;
  /** Badges next to the collections; Discover has none. */
  counts: Partial<Record<Collection, number>>;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
  format: Format;
  onFormat: (format: Format) => void;
  onCreate: () => void;
}

/**
 * The Events section's sidebar: the collections the card lists, and the facets
 * that narrow them (category and where the event takes place). Search, sort and
 * the grid/timeline switch stay in the card. While the panel is hidden the card
 * offers the same choices itself.
 */
export function EventsPanel({
  collection,
  onCollection,
  counts,
  category,
  onCategory,
  format,
  onFormat,
  onCreate,
}: EventsPanelProps) {
  return (
    <SectionPanel label="Events">
      <PanelHeader
        title="Events"
        actions={
          <PanelAction label="Create event" onClick={onCreate}>
            <Plus size={16} strokeWidth={1.8} aria-hidden />
          </PanelAction>
        }
      />
      <PanelBody>
        <PanelSection>
          {COLLECTIONS.map((item) => (
            <PanelItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              count={counts[item.id]}
              active={collection === item.id}
              onClick={() => onCollection(item.id)}
            />
          ))}
        </PanelSection>
        <PanelSection heading="Category">
          {CATEGORIES.map((item) => (
            <PanelItem
              key={item}
              icon={CATEGORY_ICONS[item]}
              label={item}
              className="events-facet"
              active={category === item}
              onClick={() => onCategory(item)}
            />
          ))}
        </PanelSection>
        <PanelSection heading="Format">
          {FORMATS.map((item) => (
            <PanelItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              className="events-facet"
              active={format === item.id}
              onClick={() => onFormat(item.id)}
            />
          ))}
        </PanelSection>
      </PanelBody>
    </SectionPanel>
  );
}
