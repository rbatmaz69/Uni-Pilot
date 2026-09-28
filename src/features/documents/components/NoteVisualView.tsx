import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { CARD_TONES, NOTE_ALIGNMENTS, noteDimension } from '@/features/documents/lib/noteVisuals';
import {
  canMoveNoteObject,
  editNoteObject,
  moveNoteObject,
} from '@/features/documents/lib/noteObjectActions';
import { closeHistory } from '@tiptap/pm/history';

type Size = { width: number; height: number };
/** Pointer movement is on screen; `scale` turns it into the page's own pixels. */
type Resize = Size & { x: number; y: number; scale: number; pointer: number; maximum: number };
const alignmentIcons = [AlignLeft, AlignCenter, AlignRight];

/** How much a zoomed page draws an element larger or smaller than its layout. */
function zoomOf(element: HTMLElement) {
  return element.offsetWidth > 0 ? element.getBoundingClientRect().width / element.offsetWidth : 1;
}

export function NoteVisualView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable,
  });
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState<Size | null>(null);
  const [resizing, setResizing] = useState(false);
  const root = useRef<HTMLElement>(null);
  const resize = useRef<Resize | null>(null);
  const latestSize = useRef<Size | null>(null);
  const layout = node.type.name === 'noteLayout';
  const label = String(layout ? node.attrs.layout : node.attrs.shape).replaceAll('-', ' ');
  const position = getPos();
  const storedWidth = noteDimension(node.attrs.width, 'width');
  const storedHeight = noteDimension(node.attrs.height, 'height');
  const style = {
    width: preview?.width ?? storedWidth ?? undefined,
    ...(preview?.width || storedWidth ? { maxWidth: '100%' } : {}),
    '--note-object-height':
      (preview?.height ?? storedHeight) ? `${preview?.height ?? storedHeight}px` : undefined,
  } as CSSProperties;

  useEffect(() => {
    if (!menu) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as globalThis.Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenu(false);
        root.current?.querySelector<HTMLButtonElement>('.note-visual-options')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [menu]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: globalThis.PointerEvent) => {
      const start = resize.current;
      if (!start || event.pointerId !== start.pointer) return;
      const size = {
        width: Math.min(
          start.maximum,
          noteDimension(start.width + (event.clientX - start.x) / start.scale, 'width')!,
        ),
        height: noteDimension(start.height + (event.clientY - start.y) / start.scale, 'height')!,
      };
      latestSize.current = size;
      setPreview(size);
    };
    const finish = (event?: globalThis.PointerEvent, cancel = false) => {
      if (event && event.pointerId !== resize.current?.pointer) return;
      const size = latestSize.current;
      if (!cancel && size && editor.isEditable) {
        editor.view.dispatch(closeHistory(editor.state.tr));
        updateAttributes(size);
        editor.view.dispatch(closeHistory(editor.state.tr));
      }
      resize.current = null;
      latestSize.current = null;
      setPreview(null);
      setResizing(false);
    };
    const cancel = (event: globalThis.PointerEvent) => finish(event, true);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(undefined, true);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
    };
  }, [resizing, editor, updateAttributes]);

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editor.isEditable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const section = root.current!;
    const body = section.querySelector<HTMLElement>(
      layout ? '.note-visual-layout-body' : '.note-visual-card-body',
    )!;
    const bounds = section.getBoundingClientRect();
    const scale = zoomOf(section);
    const parent =
      section.closest('.note-visual-layout-body') ?? section.parentElement?.parentElement;
    resize.current = {
      width: bounds.width / scale,
      height: body.getBoundingClientRect().height / scale,
      x: event.clientX,
      y: event.clientY,
      scale,
      pointer: event.pointerId,
      maximum: Math.max(180, (parent?.getBoundingClientRect().width ?? 1600 * scale) / scale),
    };
    latestSize.current = null;
    setMenu(false);
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const edit = () => {
    const currentPosition = getPos();
    if (typeof currentPosition === 'number') editNoteObject(editor, currentPosition);
    setMenu(false);
  };

  return (
    <NodeViewWrapper
      as="section"
      ref={root}
      className={`${layout ? 'note-visual-layout' : 'note-visual-card'}${selected ? ' is-selected' : ''}${resizing ? ' is-resizing' : ''}`}
      style={style}
      data-note-align={String(node.attrs.align)}
      data-note-layout={layout ? String(node.attrs.layout) : undefined}
      data-note-card={layout ? undefined : ''}
      data-note-shape={layout ? undefined : String(node.attrs.shape)}
      data-note-tone={layout ? undefined : String(node.attrs.tone)}
    >
      {editable && (
        <div className="note-visual-controls" contentEditable={false}>
          <span
            className="note-visual-handle"
            role="button"
            tabIndex={0}
            data-drag-handle
            aria-label={`Move ${label}`}
            title="Drag to move · Alt + ↑ / ↓ to reorder"
            onKeyDown={(event) => {
              const currentPosition = getPos();
              if (
                event.altKey &&
                ['ArrowUp', 'ArrowDown'].includes(event.key) &&
                typeof currentPosition === 'number'
              ) {
                event.preventDefault();
                moveNoteObject(editor, currentPosition, event.key === 'ArrowUp' ? -1 : 1);
              }
            }}
          >
            <GripVertical size={16} />
          </span>
          <span className="note-visual-label">{label}</span>
          <button
            type="button"
            className="note-visual-edit"
            aria-label={`Edit ${label}`}
            title="Edit text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={edit}
          >
            <Pencil size={13} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className="note-visual-options"
            aria-label={`${label} options`}
            aria-expanded={menu}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      )}
      <NodeViewContent
        className={layout ? 'note-visual-layout-body' : 'note-visual-card-body'}
        onMouseDown={(event: MouseEvent<HTMLElement>) => {
          // A NodeView's padded shell sits outside contentDOM. Route blank space
          // into the text instead of leaving a non-editable node selection.
          if (
            !layout &&
            event.button === 0 &&
            event.target === event.currentTarget &&
            editor.isEditable
          ) {
            event.preventDefault();
            edit();
          }
        }}
      />
      {editable && (
        <button
          type="button"
          className="note-visual-resize"
          contentEditable={false}
          aria-label={`Resize ${label}`}
          title="Drag to resize · Arrow keys adjust size"
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
              !editor.isEditable
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 40 : 10;
            const scale = zoomOf(root.current!);
            const width = storedWidth ?? root.current!.getBoundingClientRect().width / scale;
            const height =
              storedHeight ??
              root
                .current!.querySelector<HTMLElement>(
                  layout ? '.note-visual-layout-body' : '.note-visual-card-body',
                )!
                .getBoundingClientRect().height / scale;
            updateAttributes(
              event.key === 'ArrowLeft' || event.key === 'ArrowRight'
                ? {
                    width: noteDimension(
                      width + (event.key === 'ArrowRight' ? step : -step),
                      'width',
                    ),
                  }
                : {
                    height: noteDimension(
                      height + (event.key === 'ArrowDown' ? step : -step),
                      'height',
                    ),
                  },
            );
          }}
        >
          <Maximize2 size={13} />
        </button>
      )}
      {menu && editable && (
        <div
          className="note-visual-menu"
          role="dialog"
          aria-label={`${label} settings`}
          contentEditable={false}
        >
          <div className="note-visual-menu-heading">{label}</div>
          <div className="note-visual-menu-row">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={
                  typeof position !== 'number' || !canMoveNoteObject(editor, position, direction)
                }
                onClick={() => {
                  const p = getPos();
                  if (typeof p === 'number') moveNoteObject(editor, p, direction);
                  setMenu(false);
                }}
              >
                {direction === -1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}Move{' '}
                {direction === -1 ? 'up' : 'down'}
              </button>
            ))}
          </div>
          <div className="note-visual-menu-row" role="group" aria-label="Object alignment">
            {NOTE_ALIGNMENTS.map((align, index) => {
              const Icon = alignmentIcons[index]!;
              return (
                <button
                  key={align}
                  type="button"
                  aria-label={`Align ${align}`}
                  aria-pressed={node.attrs.align === align}
                  onClick={() => {
                    if (editor.isEditable) updateAttributes({ align });
                  }}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
          {!layout && (
            <div className="note-visual-tones" role="group" aria-label="Card color">
              {CARD_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  data-note-tone={tone}
                  aria-label={`${tone} card`}
                  aria-pressed={node.attrs.tone === tone}
                  onClick={() => {
                    if (editor.isEditable) updateAttributes({ tone });
                  }}
                />
              ))}
            </div>
          )}
          <div className="note-visual-size-fields">
            {(['width', 'height'] as const).map((dimension) => (
              <label key={dimension}>
                {dimension === 'width' ? 'Width' : 'Height'}
                <input
                  type="number"
                  aria-label={`Object ${dimension}`}
                  min={dimension === 'width' ? 180 : 100}
                  max={dimension === 'width' ? 1600 : 2000}
                  placeholder="Auto"
                  key={String(node.attrs[dimension])}
                  defaultValue={noteDimension(node.attrs[dimension], dimension) ?? ''}
                  onBlur={(event) => {
                    if (editor.isEditable)
                      updateAttributes({
                        [dimension]: noteDimension(event.target.value, dimension),
                      });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="note-visual-reset"
            onClick={() => {
              if (editor.isEditable) updateAttributes({ width: null, height: null });
            }}
          >
            Reset size
          </button>
          <button
            type="button"
            className="note-visual-remove"
            onClick={() => {
              if (editor.isEditable) deleteNode();
            }}
          >
            <Trash2 size={14} />
            Remove {label}
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
