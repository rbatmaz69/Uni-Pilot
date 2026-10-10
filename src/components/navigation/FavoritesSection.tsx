import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, File, FileText, Star, StarOff } from 'lucide-react';
import { FolderIcon } from '@/features/documents/components/FolderIcon';
import { Tooltip } from '@/components/ui';
import { newTabHandlers } from '@/lib/tabActions';
import {
  DOCUMENT_DRAG_TYPE,
  favoriteHref,
  favoriteLabel,
  neighbourTarget,
  readDocumentDrag,
  sidebarDragType,
  type SidebarFavorite,
} from '@/lib/sidebar';
import { cn } from '@/lib/utils';
import { FAVORITES_SECTION, useSidebarStore } from '@/store/sidebarStore';
import {
  SIDEBAR_ICON,
  sidebarIconClass,
  sidebarRowClass,
  type OpenSidebarMenu,
} from './sidebarRow';
import { useSortableList } from './useSortableList';

const TYPE = sidebarDragType(FAVORITES_SECTION);
const LABEL_ID = 'nav-section-favorites';

function iconFor(favorite: SidebarFavorite) {
  return /\.(md|markdown|txt)$/i.test(favorite.name) ? FileText : File;
}

interface FavoritesSectionProps {
  /** The favorite the Documents page currently shows, if any. */
  activePath: string | null;
  /** A document is being dragged somewhere in the app. */
  receiving: boolean;
  /** …and it is over the sidebar right now. */
  over: boolean;
  onMenu: OpenSidebarMenu;
}

/**
 * Folders and documents the student keeps at hand, as icons under the pages.
 * Anything dragged from the document explorer onto the sidebar lands here;
 * rows reorder by dragging. With none yet, the section only shows while
 * something is on its way.
 */
export function FavoritesSection({ activePath, receiving, over, onMenu }: FavoritesSectionProps) {
  const favorites = useSidebarStore((state) => state.favorites);
  const addFavorite = useSidebarStore((state) => state.addFavorite);
  const moveFavorite = useSidebarStore((state) => state.moveFavorite);
  const removeFavorite = useSidebarStore((state) => state.removeFavorite);
  const sectionRef = useRef<HTMLDivElement>(null);
  const paths = favorites.map((favorite) => favorite.path);
  const sortable = useSortableList({
    type: TYPE,
    keys: paths,
    accepts: [DOCUMENT_DRAG_TYPE],
    onDrop: (transfer, before) => {
      const moved = transfer.getData(TYPE);
      if (moved) {
        if (paths.includes(moved)) moveFavorite(moved, before);
        return;
      }
      const dropped = readDocumentDrag(transfer);
      if (dropped) addFavorite(dropped, before);
    },
  });

  // The list sits below the pages; bring it into view while something is on its way.
  useEffect(() => {
    if (receiving) sectionRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [receiving]);

  function step(favorite: SidebarFavorite, direction: 'up' | 'down') {
    const before = neighbourTarget(paths, favorite.path, direction);
    if (before !== undefined) moveFavorite(favorite.path, before);
    return before !== undefined;
  }

  function stepByKey(event: KeyboardEvent<HTMLAnchorElement>, favorite: SidebarFavorite) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const link = event.currentTarget;
    if (step(favorite, event.key === 'ArrowUp' ? 'up' : 'down'))
      requestAnimationFrame(() => link.focus());
  }

  if (!favorites.length && !receiving) return null;

  return (
    <div
      ref={sectionRef}
      role="group"
      aria-labelledby={LABEL_ID}
      data-receiving={receiving || undefined}
      data-over={over || undefined}
      className="favorites-section mb-3 rounded-md last:mb-1"
    >
      <div id={LABEL_ID} className="sr-only">
        Favorites
      </div>
      {favorites.length > 0 && (
        <ul className="sidebar-sortable mt-0.5 space-y-px" {...sortable.list}>
          {favorites.map((favorite, index) => {
            const Icon = iconFor(favorite);
            const label = favoriteLabel(favorite);
            const current = activePath === favorite.path;
            return (
              <li key={favorite.path} {...sortable.row(favorite.path, index)}>
                <Tooltip label={label} className="w-full">
                  <Link
                    to={favoriteHref(favorite)}
                    {...newTabHandlers(favoriteHref(favorite))}
                    aria-label={label}
                    aria-current={current ? 'page' : undefined}
                    className={sidebarRowClass(current)}
                    onKeyDown={(event) => stepByKey(event, favorite)}
                    onContextMenu={(event) =>
                      onMenu(event, label, [
                        {
                          label: 'Move up',
                          icon: ArrowUp,
                          shortcut: '⌥↑',
                          disabled: index === 0,
                          onSelect: () => step(favorite, 'up'),
                        },
                        {
                          label: 'Move down',
                          icon: ArrowDown,
                          shortcut: '⌥↓',
                          disabled: index === favorites.length - 1,
                          onSelect: () => step(favorite, 'down'),
                        },
                        'separator',
                        {
                          label: 'Remove from Favorites',
                          icon: StarOff,
                          onSelect: () => removeFavorite(favorite.path),
                        },
                      ])
                    }
                  >
                    {favorite.folder ? (
                      <FolderIcon path={favorite.path} />
                    ) : (
                      <Icon {...SIDEBAR_ICON} className={sidebarIconClass(current)} aria-hidden />
                    )}
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
      {!favorites.length && (
        <div
          className={cn(
            'favorites-empty mt-1 flex items-center justify-center rounded-sm border border-dashed py-2 transition-colors',
            over
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-sidebar-border text-sidebar-muted',
          )}
        >
          <Star size={14} strokeWidth={1.75} aria-hidden className="flex-none" />
          <span className="sr-only">Drop to add to Favorites</span>
        </div>
      )}
    </div>
  );
}
