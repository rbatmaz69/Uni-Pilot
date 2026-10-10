import { useEffect, useEffectEvent, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { DEFAULT_ROUTE, NAV_ITEMS } from '@/lib/navigation';
import { tabActions as actions } from '@/lib/tabActions';
import {
  canGoBack,
  canGoForward,
  currentPlace,
  placeTitle,
  sectionOf,
  type AppTab,
} from '@/lib/tabs';
import { cn } from '@/lib/utils';
import { selectActiveTab, useTabStore } from '@/store/tabStore';
import { useUiStore } from '@/store/uiStore';
import { useHasSectionPanel } from './sectionPanelHost';
import { TitleBarTools } from './TitleBarTools';

/**
 * The window's title bar, on every page: the sidebar toggle and Back and
 * Forward, as wide as the panel below them so the tabs start above the card;
 * then the tabs (`tabStore`), "+" for a new one, room to drag the window by,
 * and the search, theme and notifications. It sits on the frame, above the
 * panel and the card, beside the icon rail.
 */
export function TitleBar() {
  const { pathname } = useLocation();
  const tabs = useTabStore((state) => state.tabs);
  const active = useTabStore(selectActiveTab);
  // Documents draws its own panel; every other page shows one through `SectionPanel`.
  const hasPanel = useHasSectionPanel() || pathname === NAV_ITEMS.documents.path;
  const panelOpen = useUiStore((state) => state.panelOpen);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const panelShown = hasPanel && panelOpen;
  const strip = useRef<HTMLDivElement>(null);

  // The open tab stays in sight when there are more tabs than room.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active.id, tabs.length]);

  const newTab = () => actions.openInNewTab(sectionOf(pathname)?.path ?? DEFAULT_ROUTE);

  // ⌘[ ⌘] back and forward (not while typing), ⌘T a new tab, Ctrl+Tab the next
  // tab, ⌘1…⌘9 a tab by its place. Ctrl stands in for ⌘ where it is not a Mac.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      actions.cycle(event.shiftKey ? -1 : 1);
      return;
    }
    const mac = navigator.platform.startsWith('Mac');
    if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
    if (event.shiftKey) return;
    if (event.key === '[' || event.key === ']') {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      event.preventDefault();
      if (event.key === '[') actions.back();
      else actions.forward();
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      newTab();
    } else if (/^[1-9]$/.test(event.key)) {
      const { tabs: all } = useTabStore.getState();
      const tab = event.key === '9' ? all.at(-1) : all[Number(event.key) - 1];
      if (!tab) return;
      event.preventDefault();
      actions.select(tab.id);
    }
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listen);
    return () => document.removeEventListener('keydown', listen);
  }, []);

  return (
    <header aria-label="Title bar" className="titlebar @container/titlebar" data-tauri-drag-region>
      <div className={cn('titlebar-lead', panelShown && 'has-panel')} data-tauri-drag-region>
        {hasPanel && (
          <IconButton
            label={panelOpen ? 'Hide sidebar' : 'Show sidebar'}
            size="sm"
            className="titlebar-button"
            onClick={togglePanel}
          >
            {panelOpen ? (
              <PanelLeftClose size={17} strokeWidth={1.7} aria-hidden />
            ) : (
              <PanelLeftOpen size={17} strokeWidth={1.7} aria-hidden />
            )}
          </IconButton>
        )}
        <IconButton
          label="Go back"
          size="sm"
          className="titlebar-button"
          disabled={!canGoBack(active)}
          onClick={actions.back}
        >
          <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
        </IconButton>
        <IconButton
          label="Go forward"
          size="sm"
          className="titlebar-button"
          disabled={!canGoForward(active)}
          onClick={actions.forward}
        >
          <ChevronRight size={18} strokeWidth={1.8} aria-hidden />
        </IconButton>
      </div>
      <div ref={strip} className="app-tabs" role="tablist" aria-label="Tabs" data-tauri-drag-region>
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={tab.id === active.id}
            closable={tabs.length > 1}
            onSelect={() => actions.select(tab.id)}
            onClose={() => actions.close(tab.id)}
          />
        ))}
      </div>
      <IconButton label="New tab" size="sm" className="titlebar-button" onClick={newTab}>
        <Plus size={17} strokeWidth={1.8} aria-hidden />
      </IconButton>
      <div className="titlebar-fill" data-tauri-drag-region />
      <TitleBarTools />
    </header>
  );
}

interface TabButtonProps {
  tab: AppTab;
  active: boolean;
  closable: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function TabButton({ tab, active, closable, onSelect, onClose }: TabButtonProps) {
  const place = currentPlace(tab);
  const title = placeTitle(place);
  const Icon =
    place.kind === 'file'
      ? FileText
      : place.kind === 'folder'
        ? Folder
        : (sectionOf(place.location)?.icon ?? Globe);
  return (
    <div
      className={cn('app-tab', active && 'is-active')}
      // The middle button closes a tab, as in a browser; held down it would scroll.
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1 || !closable) return;
        event.preventDefault();
        onClose();
      }}
    >
      <button type="button" role="tab" aria-selected={active} title={title} onClick={onSelect}>
        <Icon size={14} aria-hidden />
        <span>{title}</span>
      </button>
      {closable && (
        <button
          type="button"
          className="app-tab-close"
          aria-label={`Close ${title} tab`}
          onClick={onClose}
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </div>
  );
}
