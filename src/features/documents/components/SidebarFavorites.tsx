import type { ComponentProps } from 'react';
import { File, FileText, Star, X } from 'lucide-react';
import { FolderIcon } from './FolderIcon';
import { FolderAppearanceButton } from './FolderAppearanceButton';
import type { DocumentEntry } from '@/features/documents/lib/files';
import { favoriteLabel, type SidebarFavorite } from '@/lib/sidebar';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store/sidebarStore';

/** A favorite as the explorer opens it: its note over the folder it lies in. */
function favoriteEntry(favorite: SidebarFavorite): DocumentEntry {
  return {
    path: favorite.path,
    name: favorite.name,
    folder: favorite.folder,
    size: 0,
    modified: 0,
  };
}

function iconFor(favorite: SidebarFavorite) {
  return /\.(md|markdown|txt)$/i.test(favorite.name) ? FileText : File;
}

type Props = Omit<ComponentProps<'div'>, 'children'> & {
  activePath: string;
  activeFile: string | null;
  onFolder: (path: string) => void;
  onFile: (entry: DocumentEntry) => void;
  /** A document is on its way somewhere, e.g. out of the tree or off the canvas. */
  receiving: boolean;
  /** …and it is over the favorites right now. */
  over: boolean;
};

/**
 * The folders and notes the student keeps at hand, as a list under the
 * sidebar's tabs. Anything dropped on the panel — or on its tab — joins them.
 * The drop handlers come in as props, shared with the tab.
 */
export function SidebarFavorites({
  activePath,
  activeFile,
  onFolder,
  onFile,
  receiving,
  over,
  className,
  ...panel
}: Props) {
  const favorites = useSidebarStore((state) => state.favorites);
  const removeFavorite = useSidebarStore((state) => state.removeFavorite);

  return (
    <div
      {...panel}
      className={cn('space-panel space-favorites scroll-area', className)}
      data-receiving={receiving || undefined}
      data-over={over || undefined}
    >
      {favorites.length ? (
        <ul className="space-favorites-list">
          {favorites.map((favorite) => {
            const Icon = iconFor(favorite);
            const label = favoriteLabel(favorite);
            const current =
              activeFile === favorite.path || (!activeFile && activePath === favorite.path);
            return (
              <li
                key={favorite.path}
                className={cn('document-tree-row panel-row', current && 'is-active')}
              >
                <button
                  type="button"
                  className="document-tree-name"
                  title={favorite.path}
                  aria-current={current ? 'page' : undefined}
                  onClick={() =>
                    favorite.folder ? onFolder(favorite.path) : onFile(favoriteEntry(favorite))
                  }
                >
                  {favorite.folder ? (
                    <FolderIcon path={favorite.path} />
                  ) : (
                    <Icon size={16} strokeWidth={1.8} aria-hidden />
                  )}
                  <span>{label}</span>
                </button>
                {favorite.folder && <FolderAppearanceButton path={favorite.path} name={label} />}
                <button
                  type="button"
                  className="document-tree-remove"
                  aria-label={`Remove ${label} from Favorites`}
                  onClick={() => removeFavorite(favorite.path)}
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="space-favorites-empty">
          <Star size={15} strokeWidth={1.75} aria-hidden />
          <span>
            {receiving
              ? 'Drop to add to Favorites'
              : 'Drag folders and notes here to keep them at hand.'}
          </span>
        </p>
      )}
    </div>
  );
}
