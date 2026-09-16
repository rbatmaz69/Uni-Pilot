import { EVENT_COVERS, type Cover } from '@/features/events/lib/covers';

export function EventArtwork({ cover, compact = false }: { cover: Cover; compact?: boolean }) {
  return (
    <div
      className={`event-art event-art--${cover} ${compact ? 'event-art--compact' : ''}`}
      aria-hidden="true"
    >
      <img src={EVENT_COVERS[cover].image} alt="" />
    </div>
  );
}
