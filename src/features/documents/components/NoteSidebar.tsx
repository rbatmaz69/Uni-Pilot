import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, ChevronUp, Link2, ListChecks, ListTree, Search } from 'lucide-react';
import {
  collectLinks,
  collectOutline,
  collectTasks,
  type LinkEntry,
  type OutlineEntry,
  type TaskEntry,
} from '@/features/documents/lib/noteOutline';
import { noteSearchState, setNoteSearch } from '@/features/documents/lib/noteSearch';
import { cn } from '@/lib/utils';

type Tab = 'outline' | 'tasks' | 'links' | 'search';

const TABS: { value: Tab; label: string; icon: ReactNode }[] = [
  { value: 'outline', label: 'Outline', icon: <ListTree size={15} /> },
  { value: 'tasks', label: 'Tasks', icon: <ListChecks size={15} /> },
  { value: 'links', label: 'Links', icon: <Link2 size={15} /> },
  { value: 'search', label: 'Find in note', icon: <Search size={15} /> },
];

interface NoteSidebarProps {
  editor: Editor;
  /** The element the page scrolls in, to follow the heading being read. */
  scrollRoot: HTMLElement | null;
  /** Changes each time ⌘F / Ctrl+F asks for the search field. */
  searchRequest: number;
}

type Derived =
  | { tab: 'outline'; entries: OutlineEntry[] }
  | { tab: 'tasks'; entries: TaskEntry[] }
  | { tab: 'links'; entries: LinkEntry[] }
  | { tab: 'search'; count: number; current: number };

function sameDerived(a: Derived, b: Derived | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function smooth(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Moves the cursor to `pos` and brings that part of the page into view. */
function reveal(editor: Editor, pos: number, block: ScrollLogicalPosition = 'start') {
  editor.chain().focus().setTextSelection(pos).run();
  const { node } = editor.view.domAtPos(pos);
  const element = node instanceof HTMLElement ? node : node.parentElement;
  element?.scrollIntoView?.({ block, behavior: smooth() });
}

function host(href: string) {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
}

/**
 * Craft's left panel, derived from the note itself: headings, checklist items,
 * links and find-in-note. Nothing here is stored, so none of it can change the file.
 */
export function NoteSidebar({ editor, scrollRoot, searchRequest }: NoteSidebarProps) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('outline');
  const [query, setQuery] = useState('');
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const tabs = useRef<HTMLDivElement>(null);

  // Only the visible tab is computed on each edit.
  const derived = useEditorState({
    editor,
    selector: ({ editor: current }): Derived => {
      const { doc } = current.state;
      if (tab === 'outline') return { tab, entries: collectOutline(doc) };
      if (tab === 'tasks') return { tab, entries: collectTasks(doc) };
      if (tab === 'links') return { tab, entries: collectLinks(doc) };
      const search = noteSearchState(current.state);
      return { tab, count: search?.matches.length ?? 0, current: search?.current ?? 0 };
    },
    equalityFn: sameDerived,
  });

  // ⌘F switches to the search tab (state adjusted while rendering, not in an effect)…
  const [handledRequest, setHandledRequest] = useState(searchRequest);
  if (searchRequest !== handledRequest) {
    setHandledRequest(searchRequest);
    setTab('search');
  }
  // …and, once it is shown, puts the cursor in the field.
  useEffect(() => {
    if (searchRequest) searchField.current?.select();
  }, [searchRequest]);

  // Leaving the search tab, or closing the sidebar, clears the highlights.
  useEffect(() => {
    if (tab !== 'search' || editor.isDestroyed) return;
    return () => {
      if (!editor.isDestroyed) setNoteSearch(editor.view, '');
    };
  }, [editor, tab]);

  const outline = derived.tab === 'outline' ? derived.entries : null;
  useEffect(() => {
    if (!outline || !scrollRoot) return;
    const follow = () => {
      const top = scrollRoot.getBoundingClientRect().top + 96;
      let current: number | null = null;
      for (const entry of outline) {
        const element = editor.view.nodeDOM(entry.pos);
        if (!(element instanceof HTMLElement)) continue;
        if (element.getBoundingClientRect().top <= top) current = entry.pos;
        else break;
      }
      setActiveHeading(current ?? outline[0]?.pos ?? null);
    };
    follow();
    scrollRoot.addEventListener('scroll', follow, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', follow);
  }, [editor, outline, scrollRoot]);

  function selectTab(next: Tab) {
    setTab(next);
    tabs.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex((entry) => entry.value === tab);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (next) selectTab(next.value);
  }

  function search(nextQuery: string, current = 0) {
    setNoteSearch(editor.view, nextQuery, current);
    const state = noteSearchState(editor.state);
    const match = state?.matches[state.current];
    if (!match) return;
    const { node } = editor.view.domAtPos(match.from);
    const element = node instanceof HTMLElement ? node : node.parentElement;
    element?.scrollIntoView?.({ block: 'center', behavior: smooth() });
  }

  function step(direction: 1 | -1) {
    if (derived.tab !== 'search' || !derived.count) return;
    search(query, derived.current + direction);
  }

  function toggleTask(entry: TaskEntry) {
    editor
      .chain()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(entry.pos);
        if (node?.type.name !== 'taskItem') return false;
        tr.setNodeMarkup(entry.pos, undefined, { ...node.attrs, checked: !entry.checked });
        return true;
      })
      .run();
  }

  const panelId = `${id}-panel`;
  const labelOf = TABS.find((entry) => entry.value === tab)?.label ?? '';

  return (
    <aside className="note-sidebar" aria-label="Note overview">
      <div
        ref={tabs}
        role="tablist"
        aria-label="Note overview"
        className="note-sidebar-tabs"
        onKeyDown={onTabKey}
      >
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            data-tab={entry.value}
            id={`${id}-${entry.value}`}
            aria-label={entry.label}
            title={entry.label}
            aria-selected={tab === entry.value}
            aria-controls={panelId}
            tabIndex={tab === entry.value ? 0 : -1}
            onClick={() => setTab(entry.value)}
          >
            {entry.icon}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${id}-${tab}`}
        className="note-sidebar-panel"
      >
        <h2 className="note-panel-label">{labelOf}</h2>

        {derived.tab === 'outline' ? (
          derived.entries.length ? (
            <ul className="note-outline">
              {derived.entries.map((entry) => (
                <li key={entry.pos}>
                  <button
                    type="button"
                    className={cn(
                      `is-level-${entry.level}`,
                      activeHeading === entry.pos && 'is-here',
                    )}
                    aria-current={activeHeading === entry.pos ? 'location' : undefined}
                    onClick={() => reveal(editor, entry.pos + 1)}
                  >
                    {entry.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note-sidebar-empty">
              Headings you add appear here. Type # and a space, or /heading.
            </p>
          )
        ) : null}

        {derived.tab === 'tasks' ? (
          derived.entries.length ? (
            <>
              <p className="note-sidebar-meta">
                {derived.entries.filter((entry) => entry.checked).length} of{' '}
                {derived.entries.length} done
              </p>
              <ul className="note-tasks">
                {derived.entries.map((entry) => (
                  <li key={entry.pos} className={cn(entry.checked && 'is-done')}>
                    <input
                      type="checkbox"
                      checked={entry.checked}
                      aria-label={entry.text || 'Untitled task'}
                      disabled={!editor.isEditable}
                      onChange={() => toggleTask(entry)}
                    />
                    <button type="button" onClick={() => reveal(editor, entry.pos + 2, 'center')}>
                      {entry.text || 'Untitled task'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="note-sidebar-empty">
              No checklist in this note yet. Type [ ] and a space, or /checklist.
            </p>
          )
        ) : null}

        {derived.tab === 'links' ? (
          derived.entries.length ? (
            <ul className="note-links">
              {derived.entries.map((entry) => (
                <li key={entry.pos}>
                  <button type="button" onClick={() => reveal(editor, entry.pos, 'center')}>
                    <strong>{entry.text}</strong>
                    <span>{host(entry.href)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note-sidebar-empty">
              Links in this note appear here. Paste a web address or press ⌘K on selected text.
            </p>
          )
        ) : null}

        {derived.tab === 'search' ? (
          <div className="note-find">
            <input
              ref={searchField}
              type="search"
              aria-label="Find in note"
              placeholder="Find in note"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                search(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  step(event.shiftKey ? -1 : 1);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setQuery('');
                  search('');
                  editor.commands.focus();
                }
              }}
            />
            <div className="note-find-bar">
              <span role="status">
                {query.trim()
                  ? derived.count
                    ? `${derived.current + 1} of ${derived.count}`
                    : 'No matches'
                  : ''}
              </span>
              <button
                type="button"
                aria-label="Previous match"
                title="Previous match (⇧↩)"
                disabled={!derived.count}
                onClick={() => step(-1)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                aria-label="Next match"
                title="Next match (↩)"
                disabled={!derived.count}
                onClick={() => step(1)}
              >
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
