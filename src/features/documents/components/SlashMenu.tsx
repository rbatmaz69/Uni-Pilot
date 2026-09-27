import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { registerSlashKeys, type SlashMenuState } from '@/features/documents/lib/slashCommand';
import { SLASH_ICONS } from './slashIcons';

const MENU_HEIGHT = 330;
const GAP = 6;

interface SlashMenuProps {
  editor: Editor;
  menu: SlashMenuState;
}

/**
 * The block menu opened by typing `/`: a listbox the editor keeps focus over,
 * pointing at the highlighted option with `aria-activedescendant`.
 */
export function SlashMenu({ editor, menu }: SlashMenuProps) {
  const id = useId();
  // The highlight belongs to one query; typing more starts at the best match again.
  const [cursor, setCursor] = useState({ query: menu.query, active: 0 });
  const list = useRef<HTMLDivElement>(null);
  const { items, choose, query } = menu;
  const active = cursor.query === query ? cursor.active : 0;
  const index = Math.min(active, Math.max(0, items.length - 1));
  const setActive = (next: number) => setCursor({ query, active: next });

  // Under the typed `/query`, or above it when the page ends too close below.
  const rect = menu.anchor();
  const position = rect
    ? {
        top:
          window.innerHeight - rect.bottom > MENU_HEIGHT + GAP
            ? rect.bottom + GAP
            : Math.max(GAP, rect.top - MENU_HEIGHT - GAP),
        left: Math.max(GAP, Math.min(rect.left, window.innerWidth - 300)),
      }
    : null;

  // The editor asks the open menu first about ↑ ↓ Enter and Tab.
  useEffect(
    () =>
      registerSlashKeys(editor, (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!items.length) return false;
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setCursor({ query, active: (index + step + items.length) % items.length });
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[index];
          if (!item) return false;
          choose(item);
          return true;
        }
        return false;
      }),
    [choose, editor, index, items, query],
  );

  // The editor keeps focus; assistive tech follows the highlighted option.
  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', `${id}-list`);
    dom.setAttribute('aria-expanded', 'true');
    if (items[index]) dom.setAttribute('aria-activedescendant', `${id}-${items[index].id}`);
    else dom.removeAttribute('aria-activedescendant');
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-expanded');
    };
  }, [editor, id, index, items]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  let group = '';
  return createPortal(
    <div
      ref={list}
      id={`${id}-list`}
      role="listbox"
      aria-label="Insert block"
      className="note-slash"
      style={position ?? { visibility: 'hidden' }}
      // Clicking an option must not take focus from the editor.
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.length ? (
        items.map((item, position) => {
          const heading = item.group !== group ? item.group : null;
          group = item.group;
          return (
            <div key={item.id} role="presentation">
              {heading ? (
                <div role="presentation" className="note-slash-group">
                  {heading}
                </div>
              ) : null}
              <div
                role="option"
                id={`${id}-${item.id}`}
                aria-selected={position === index}
                className="note-slash-option"
                onMouseEnter={() => setActive(position)}
                onClick={() => choose(item)}
              >
                <span className="note-slash-icon" aria-hidden>
                  {SLASH_ICONS[item.id]}
                </span>
                <span className="note-slash-text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </div>
            </div>
          );
        })
      ) : (
        <p className="note-slash-empty">No block matches “{query}”. Press Esc to keep typing.</p>
      )}
    </div>,
    document.body,
  );
}
