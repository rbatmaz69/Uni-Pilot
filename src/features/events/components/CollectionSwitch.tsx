import { COLLECTIONS, type Collection } from '@/features/events/lib/collections';

interface CollectionSwitchProps {
  collection: Collection;
  onCollection: (collection: Collection) => void;
  counts: Partial<Record<Collection, number>>;
}

/**
 * The collections as a compact segmented control in the card. The page shows it
 * only while the Events panel is hidden, so the student can still switch lists.
 */
export function CollectionSwitch({ collection, onCollection, counts }: CollectionSwitchProps) {
  return (
    <div className="events-segments" role="group" aria-label="Event collections">
      {COLLECTIONS.map(({ id, label, icon: Icon }) => {
        const count = counts[id];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={collection === id}
            onClick={() => onCollection(id)}
          >
            <Icon size={14} strokeWidth={1.8} aria-hidden />
            {label}
            {count ? (
              <>
                {' '}
                <span className="events-segment-count">{count.toLocaleString()}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
