import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  Check,
  ChevronsUpDown,
  Files,
  GraduationCap,
  Pencil,
  Plus,
  School,
  Trash2,
} from 'lucide-react';
import { NewBadge } from './NewBadge';
import { COURSES_SPACE, DOCUMENTS, ILIAS, type Space } from '@/features/documents/lib/spaces';
import { cn } from '@/lib/utils';

type SpaceIconProps = { id: string; space?: Space | undefined; size: number };

function SpaceIcon({ id, space, size }: SpaceIconProps) {
  if (id === DOCUMENTS) return <Files size={size} aria-hidden />;
  if (id === ILIAS) return <School size={size} aria-hidden />;
  if (space?.folder === COURSES_SPACE) return <GraduationCap size={size} aria-hidden />;
  return (
    <span className="space-monogram" aria-hidden>
      {(space?.name ?? '').charAt(0).toLocaleUpperCase()}
    </span>
  );
}

type Props = {
  /** The open space: `DOCUMENTS`, `ILIAS` or the id of one the student added. */
  spaceId: string;
  name: string;
  /** The open space if the student added it; Documents and ILIAS are not theirs to change. */
  added: Space | undefined;
  spaces: Space[];
  /** How many files are new in each space, by space id. */
  unseen: Readonly<Record<string, number>>;
  onPick: (id: string) => void;
  onNewSpace: () => void;
  onEditSpace: (space: Space) => void;
  onRemoveSpace: (space: Space) => void;
};

/**
 * The name of the open space, as the heading of the sidebar. It opens a menu of
 * every space — Documents, ILIAS and the ones the student added — with the one
 * that is open marked, and the ways to add, edit or remove a space.
 */
export function SpaceSwitcher({
  spaceId,
  name,
  added,
  spaces,
  unseen,
  onPick,
  onNewSpace,
  onEditSpace,
  onRemoveSpace,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    // The open space is where the keyboard starts.
    rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function choose(action: () => void) {
    close(true);
    action();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focus(index + 1);
      case 'ArrowUp':
        return focus(index === -1 ? items.length - 1 : index - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(items.length - 1);
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        return close(true);
      case 'Tab':
        return close(false);
    }
  }

  function spaceItem(id: string, label: string, shown: string, space?: Space) {
    const count = unseen[id] ?? 0;
    const current = spaceId === id;
    return (
      <button
        key={id}
        type="button"
        role="menuitemradio"
        aria-checked={current}
        aria-label={count ? `${label}, ${count} new` : label}
        tabIndex={-1}
        className={cn('space-menu-item', current && 'is-current')}
        onClick={() => choose(() => onPick(id))}
      >
        <SpaceIcon id={id} space={space} size={16} />
        <span className="space-menu-name">{shown}</span>
        <NewBadge count={count} />
        {current ? <Check size={14} className="space-menu-check" aria-hidden /> : null}
      </button>
    );
  }

  return (
    <div ref={rootRef}>
      <h2 className="space-title">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(!open)}
          onKeyDown={onButtonKeyDown}
        >
          <SpaceIcon id={spaceId} space={added} size={17} />
          <span className="space-title-name">{name}</span>
          <ChevronsUpDown size={13} className="space-title-chevron" aria-hidden />
        </button>
      </h2>
      {open ? (
        <div
          id={menuId}
          className="space-menu"
          role="menu"
          aria-label="Spaces"
          onKeyDown={onMenuKeyDown}
        >
          {spaceItem(DOCUMENTS, 'Documents', 'Documents')}
          {spaceItem(ILIAS, 'ILIAS', 'ILIAS')}
          {spaces.map((space) => spaceItem(space.id, `${space.name} space`, space.name, space))}
          <div role="separator" className="space-menu-separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="space-menu-item"
            onClick={() => choose(onNewSpace)}
          >
            <Plus size={16} aria-hidden />
            <span className="space-menu-name">New space…</span>
          </button>
          {added ? (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="space-menu-item"
                onClick={() => choose(() => onEditSpace(added))}
              >
                <Pencil size={15} aria-hidden />
                <span className="space-menu-name">Edit space…</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="space-menu-item"
                onClick={() => choose(() => onRemoveSpace(added))}
              >
                <Trash2 size={15} aria-hidden />
                <span className="space-menu-name">
                  Remove from sidebar
                  <span className="space-menu-note">The folder and its files stay.</span>
                </span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
