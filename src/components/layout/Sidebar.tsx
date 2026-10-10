import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CustomizeSidebarDialog,
  FavoritesSection,
  NavigationItem,
  NavigationSection,
} from '@/components/navigation';
import { ContextMenu, Tooltip, type MenuEntry } from '@/components/ui';
import { useScrollEdges } from '@/hooks/useScrollEdges';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { arrangeSections, DOCUMENT_DRAG_TYPE, hasDragType, readDocumentDrag } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import { AppLogo } from './AppLogo';

const NO_OVERRIDES = {};

type OpenMenu = { at: { x: number; y: number }; label: string; items: readonly MenuEntry[] };

/**
 * The app's navigation: a slim rail of icons down the left edge, on every page.
 * Names show as tooltips and are the links' accessible names. A page that
 * needs a sidebar of its own gets it beside the rail (see `SectionPanel`), so
 * this one never grows.
 *
 * The student arranges it: order and visibility per section (context menu or
 * Customize sidebar), and favorites, which documents dropped on it join.
 *
 * Settings and the profile are pinned at the foot; in a window too short for
 * every icon, only the icons between the logo and the foot scroll, and fade at
 * the edge that has more behind it.
 */
export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const order = useSidebarStore((state) => state.order);
  const hidden = useSidebarStore((state) => state.hidden);
  const favorites = useSidebarStore((state) => state.favorites);
  const activeDocument = useSidebarStore((state) => state.activeDocument);
  const documentDrag = useSidebarStore((state) => state.documentDrag);
  const pointerOver = useSidebarStore((state) => state.documentDragOver);
  const addFavorite = useSidebarStore((state) => state.addFavorite);
  const [dropOver, setDropOver] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const scrollEdges = useScrollEdges(navRef);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const sections = useMemo(
    () => arrangeSections(NAV_SECTIONS, { order, hidden }).filter((item) => item.items.length),
    [order, hidden],
  );
  // A favorite shown on the Documents page takes the highlight from Documents itself.
  const activeFavorite =
    pathname === NAV_ITEMS.documents.path &&
    favorites.some((favorite) => favorite.path === activeDocument)
      ? activeDocument
      : null;
  const activeOverrides = activeFavorite ? { [NAV_ITEMS.documents.path]: false } : NO_OVERRIDES;
  const closeMenu = useCallback(() => setMenu(null), []);
  const openCustomize = useCallback(() => setCustomizing(true), []);

  function openMenu(event: MouseEvent<HTMLElement>, label: string, items: readonly MenuEntry[]) {
    event.preventDefault();
    event.stopPropagation();
    // The context-menu key has no pointer position; open under the row instead.
    const rect = event.currentTarget.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    setMenu({
      at: keyboard
        ? { x: rect.left + 12, y: rect.bottom + 4 }
        : { x: event.clientX, y: event.clientY },
      label,
      items,
    });
  }

  return (
    <aside
      data-tauri-drag-region
      aria-label="Main navigation"
      className="sidebar-glass relative flex h-full flex-none flex-col overflow-hidden px-2 py-3"
    >
      <div
        data-tauri-drag-region
        className="sidebar-brand flex h-[64px] flex-none items-center justify-center pb-3"
      >
        <AppLogo />
      </div>
      <nav
        ref={navRef}
        aria-label="Sections"
        data-favorites-drop
        data-more-above={scrollEdges.above || undefined}
        data-more-below={scrollEdges.below || undefined}
        className="rail-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        onDragOver={(event) => {
          if (!hasDragType(event.dataTransfer, DOCUMENT_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'link';
          setDropOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOver(false);
        }}
        onDrop={(event) => {
          setDropOver(false);
          const dropped = readDocumentDrag(event.dataTransfer);
          if (!dropped) return;
          event.preventDefault();
          addFavorite(dropped);
        }}
        onContextMenu={(event) =>
          openMenu(event, 'Sidebar', [
            { label: 'Customize sidebar…', icon: SlidersHorizontal, onSelect: openCustomize },
          ])
        }
      >
        {sections.map((section) => (
          <NavigationSection
            key={section.id}
            section={section}
            activeOverrides={activeOverrides}
            onMenu={openMenu}
            onCustomize={openCustomize}
          />
        ))}
        <FavoritesSection
          activePath={activeFavorite}
          receiving={Boolean(documentDrag) || dropOver}
          over={dropOver || pointerOver}
          onMenu={openMenu}
        />
      </nav>
      <div className="flex-none pt-2">
        <NavigationItem item={NAV_ITEMS.settings} />
        <Tooltip label="Alex Morgan" className="mt-3 w-full">
          <button
            type="button"
            aria-label="Open profile for Alex"
            onClick={() => {
              void navigate('/settings');
            }}
            className="sidebar-profile flex w-full items-center justify-center border-t border-sidebar-border/60 py-3"
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#c8dbd7] text-[12px] font-semibold text-[#3f6860] ring-2 ring-white/70 flexoki:bg-teal-soft flexoki:text-teal flexoki:ring-sidebar-border">
              AM
            </span>
          </button>
        </Tooltip>
      </div>
      {menu && (
        <ContextMenu at={menu.at} label={menu.label} items={menu.items} onClose={closeMenu} />
      )}
      <CustomizeSidebarDialog open={customizing} onClose={() => setCustomizing(false)} />
    </aside>
  );
}
