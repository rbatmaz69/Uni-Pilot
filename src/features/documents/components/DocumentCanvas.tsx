import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  Hand,
  Maximize,
  Minus,
  MousePointer2,
  Pin,
  Plus,
  Upload,
  SlidersHorizontal,
} from 'lucide-react';
import { IconButton } from '@/components/ui';
import {
  editable,
  fileKind,
  fileSize,
  previewable,
  type DocumentEntry,
  type DocumentPreviewData,
} from '@/features/documents/lib/files';
import { IliasBadge } from '@/features/integrations';
import { loadNotePreview, loadPreview } from '@/features/documents/lib/previewCache';
import {
  packFolder,
  outsideFolder,
  type PreviewSize,
  type FolderLayout,
} from '@/features/documents/lib/folderLayout';
import { cn } from '@/lib/utils';
import { DocumentThumbnail } from './DocumentThumbnail';
import { FolderArtwork } from './FolderArtwork';
import { NoteVisualPreview } from './NoteVisualPreview';
import {
  FOLDER_OPEN_MS,
  FOLDER_STAGGER_MS,
  FOLDER_STAGGER_LIMIT,
  FOLDER_CLOSE_MS,
  FOLDER_SETTLE_MS,
} from '../lib/canvasMotion';
import '../documents.css';

type Point = { x: number; y: number };
type CardState = Point & { pinned?: boolean };
type Layout = Record<string, CardState>;
type ScrollMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollWidth: number;
  scrollHeight: number;
};
const STORAGE = 'uni-pilot:document-canvas:v1';
const WIDTH = 176;
const HEIGHT = 216;
const FOLDER_CONTENT_GAP = 36;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const PARENT_HOLD_MS = 450;
// Scrollbars show nearby canvas space; the camera itself has no pan limits.
const PAN_MARGIN = 1000;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
// Separate presentation positions preserve existing freeform arrangements.
const layoutKey = (entry: DocumentEntry) =>
  entry.path.includes('/') ? `focus-v2:${entry.path}` : entry.path;
const initialPoint = (index: number): Point => ({
  x: 52 + (index % 4) * 236,
  y: 48 + Math.floor(index / 4) * 284,
});
function aboveFolder(folderLayout: FolderLayout, folder: Point, width = WIDTH): FolderLayout {
  const dx = folder.x + width / 2 - folderLayout.bounds.width / 2 - folderLayout.bounds.x;
  const dy = folder.y - FOLDER_CONTENT_GAP - folderLayout.bounds.height - folderLayout.bounds.y;
  return {
    cards: Object.fromEntries(
      Object.entries(folderLayout.cards).map(([path, card]) => [
        path,
        { ...card, x: card.x + dx, y: card.y + dy },
      ]),
    ),
    bounds: {
      ...folderLayout.bounds,
      x: folderLayout.bounds.x + dx,
      y: folderLayout.bounds.y + dy,
    },
  };
}
function readLayout(): Layout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([, point]) =>
          point &&
          typeof point === 'object' &&
          'x' in point &&
          typeof point.x === 'number' &&
          Number.isFinite(point.x) &&
          'y' in point &&
          typeof point.y === 'number' &&
          Number.isFinite(point.y) &&
          point.x >= 0 &&
          point.y >= 0,
      ),
    ) as Layout;
  } catch {
    return {};
  }
}
function colorFor(entry: DocumentEntry) {
  return ['sage', 'peach', 'blue', 'lilac'][
    Array.from(entry.name).reduce((n, c) => n + c.charCodeAt(0), 0) % 4
  ];
}

function CanvasScrollbar({
  axis,
  metrics,
  onScrollTo,
}: {
  axis: 'horizontal' | 'vertical';
  metrics: ScrollMetrics;
  onScrollTo: (axis: 'horizontal' | 'vertical', value: number) => void;
}) {
  const horizontal = axis === 'horizontal';
  const size = horizontal ? metrics.width : metrics.height;
  const trackSize = Math.max(1, size - (horizontal ? 44 : 36));
  const content = horizontal ? metrics.scrollWidth : metrics.scrollHeight;
  const position = horizontal ? metrics.left : metrics.top;
  const max = content - size;
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const drag = useRef<{ start: number; position: number } | null>(null);
  const thumbSize = Math.min(trackSize, Math.max(36, (size / content) * trackSize));
  const thumbPosition = max > 0 ? (position / max) * (trackSize - thumbSize) : 0;

  function stop() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
  }

  useEffect(() => stop, []);
  if (max <= 1) return null;

  return (
    <div
      ref={track}
      className={cn('canvas-scrollbar', `is-${axis}`)}
      role="scrollbar"
      aria-label={`${horizontal ? 'Horizontal' : 'Vertical'} canvas scrollbar`}
      aria-orientation={axis}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      onKeyDown={(event) => {
        const step =
          event.key === 'PageDown'
            ? size * 0.8
            : event.key === 'PageUp'
              ? -size * 0.8
              : event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')
                ? 48
                : event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')
                  ? -48
                  : 0;
        if (!step) return;
        event.preventDefault();
        onScrollTo(axis, position + step);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const coordinate = horizontal ? event.clientX : event.clientY;
        if ((event.target as HTMLElement).classList.contains('canvas-scrollbar-thumb')) {
          drag.current = { start: coordinate, position };
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const click = coordinate - (horizontal ? bounds.left : bounds.top);
        const direction = click < thumbPosition ? -1 : 1;
        let lastTime = performance.now();
        let scrollPosition = position;
        const tick = (time: number) => {
          const before = scrollPosition;
          if ((direction > 0 && before >= max) || (direction < 0 && before <= 0)) return;
          const elapsed = Math.min(40, Math.max(0, time - lastTime));
          lastTime = time;
          scrollPosition = Math.max(0, Math.min(max, before + direction * elapsed * 0.7));
          onScrollTo(axis, scrollPosition);
          frame.current = requestAnimationFrame(tick);
        };
        stop();
        frame.current = requestAnimationFrame(tick);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const coordinate = horizontal ? event.clientX : event.clientY;
        onScrollTo(
          axis,
          drag.current.position +
            ((coordinate - drag.current.start) / Math.max(1, trackSize - thumbSize)) * max,
        );
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      <span
        className="canvas-scrollbar-thumb"
        style={
          horizontal
            ? { width: thumbSize, left: thumbPosition }
            : { height: thumbSize, top: thumbPosition }
        }
      />
    </div>
  );
}

const CardContent = memo(
  function CardContent({
    entry,
    preview,
    thumbnail,
    pinned,
    frame,
    onMeasure,
    canPreviewFolders = false,
    lightweight = false,
  }: {
    entry: DocumentEntry;
    canPreviewFolders?: boolean;
    lightweight?: boolean;
    preview?: string | undefined;
    thumbnail?: DocumentPreviewData | undefined;
    pinned?: boolean | undefined;
    frame?: PreviewSize | undefined;
    onMeasure?: ((path: string, size: PreviewSize) => void) | undefined;
  }) {
    const report = useCallback(
      (size: PreviewSize) => onMeasure?.(entry.path, size),
      [entry.path, onMeasure],
    );
    return (
      <>
        {entry.folder ? (
          <FolderArtwork entry={entry} enabled={canPreviewFolders && !lightweight} />
        ) : lightweight ? (
          <span className="canvas-paper canvas-paper--in-flight" aria-hidden>
            <span className="canvas-paper-type">{fileKind(entry).replace(' file', '')}</span>
            <strong>{entry.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ')}</strong>
            <span className="canvas-flight-lines" />
          </span>
        ) : thumbnail ? (
          <span className="canvas-paper canvas-paper--visual">
            <span className="canvas-paper-media">
              <DocumentThumbnail
                data={thumbnail}
                alt={`${entry.name} first page`}
                onDimensions={report}
              />
              <span className="canvas-paper-media-wash" aria-hidden />
              <span className="canvas-paper-media-type">
                {fileKind(entry).replace(' file', '')}
              </span>
            </span>
          </span>
        ) : editable(entry) ? (
          <div className="canvas-paper canvas-paper--note">
            <NoteVisualPreview
              name={entry.name}
              path={entry.path}
              content={preview ?? ''}
              frame={frame}
              onDimensions={report}
            />
          </div>
        ) : (
          <span className="canvas-paper">
            <span className="canvas-paper-type">
              {fileKind(entry).replace(' file', '')}
              <FileText size={13} />
            </span>
            <strong>{entry.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ')}</strong>
            <span className="canvas-file-detail">{`${fileSize(entry.size)} · Open to view`}</span>
            <span className="canvas-paper-footer">
              Study material
              <span>↗</span>
            </span>
          </span>
        )}
        <span className="canvas-card-caption">
          <strong>{entry.name}</strong>
          <span>
            {entry.ilias === 'gone'
              ? 'No longer on ILIAS'
              : entry.folder
                ? 'Folder · open to explore'
                : fileKind(entry)}
          </span>
        </span>
        {pinned && <Pin className="canvas-pin" size={13} fill="currentColor" aria-label="Pinned" />}
        {entry.ilias === 'root' ? (
          <IliasBadge size="sm" className="absolute -top-2 left-2 z-10" />
        ) : entry.ilias === 'file' || entry.ilias === 'folder' || entry.ilias === 'gone' ? (
          <IliasBadge
            size="sm"
            showLabel={false}
            title="Downloaded from ILIAS"
            className="absolute -top-2 left-2 z-10"
          />
        ) : null}
      </>
    );
  },
  (before, after) =>
    before.entry === after.entry &&
    before.preview === after.preview &&
    before.thumbnail === after.thumbnail &&
    before.pinned === after.pinned &&
    before.canPreviewFolders === after.canPreviewFolders &&
    before.lightweight === after.lightweight &&
    before.onMeasure === after.onMeasure &&
    before.frame?.width === after.frame?.width &&
    before.frame?.height === after.frame?.height,
);

// Keep slots fixed for a listing. Late image/PDF measurements are remembered for
// the next visit, rather than repacking the entire collection underneath a flight.
function useFolderSlots(entries: DocumentEntry[], dimensions: Record<string, PreviewSize>) {
  const [snapshot, setSnapshot] = useState(() => ({
    entries,
    layout: packFolder(entries, dimensions),
  }));
  if (snapshot.entries !== entries) {
    const next = { entries, layout: packFolder(entries, dimensions) };
    setSnapshot(next);
    return next.layout;
  }
  return snapshot.layout;
}

interface Props {
  entries: DocumentEntry[];
  allEntries: DocumentEntry[];
  background: DocumentEntry[];
  path: string;
  selected: string | null;
  disabled: boolean;
  loading: boolean;
  canEdit: boolean;
  query: string;
  onSelect: (path: string | null) => void;
  onOpen: (entry: DocumentEntry) => void;
  onMove: (entry: DocumentEntry, destination: string) => Promise<boolean>;
  onImport: (files: File[]) => void;
  onBack: () => void;
  onCreate: () => void;
  options: ReactNode;
}

export function DocumentCanvas({
  entries,
  allEntries,
  background,
  path,
  selected,
  disabled,
  loading,
  canEdit,
  query,
  onSelect,
  onOpen,
  onMove,
  onImport,
  onBack,
  onCreate,
  options,
}: Props) {
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [settled, setSettled] = useState<{ path: string; entries: DocumentEntry[] } | null>(null);
  const moving = Boolean(path && (settled?.path !== path || settled.entries !== allEntries));
  useEffect(() => {
    if (loading) return;
    const delay =
      path && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? FOLDER_SETTLE_MS
        : 0;
    const timer = window.setTimeout(() => setSettled({ path, entries: allEntries }), delay);
    return () => window.clearTimeout(timer);
  }, [path, loading, allEntries]);
  const [dimensions, setDimensions] = useState<Record<string, PreviewSize>>({});
  const [heldLayout, setHeldLayout] = useState<FolderLayout | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const reportDimensions = useCallback((path: string, size: PreviewSize) => {
    if (
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height) ||
      size.width <= 0 ||
      size.height <= 0
    )
      return;
    setDimensions((previous) =>
      previous[path]?.width === size.width && previous[path]?.height === size.height
        ? previous
        : { ...previous, [path]: size },
    );
  }, []);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, DocumentPreviewData>>({});
  const settings = useRef<HTMLDetailsElement>(null);
  const [zoom, setZoom] = useState(0.85);
  const zoomRef = useRef(zoom);
  const customZoom = useRef(false);
  const [hand, setHand] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [parentDrop, setParentDrop] = useState<'pending' | 'ready' | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [fileHover, setFileHover] = useState(false);
  const [pinnedOnlyPath, setPinnedOnlyPath] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [closingFolder, setClosingFolder] = useState(false);
  const [openedAt, setOpenedAt] = useState<Record<string, Point>>({});
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const cameraAnimation = useRef<Animation | null>(null);
  const [camera, setCamera] = useState<Point>({ x: 0, y: 0 });
  const cameraRef = useRef(camera);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const closeTimer = useRef<number | null>(null);
  const parentHoldTimer = useRef<number | null>(null);
  const parentDropRef = useRef<'pending' | 'ready' | null>(null);
  const gesture = useRef<{
    entry: DocumentEntry;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);
  const pan = useRef<{
    start: Point;
    origin: Point;
    moved: boolean;
    primary: boolean;
  } | null>(null);
  const suppressPanClick = useRef(false);
  const suppressClick = useRef(false);
  const pinnedOnly = pinnedOnlyPath === path;
  const shown = entries.filter((entry) => !pinnedOnly || layout[entry.path]?.pinned);
  const packed = useFolderSlots(allEntries, dimensions);
  const parentPacked = useFolderSlots(background, dimensions);
  const parentPath = path.split('/').slice(0, -1).join('/');
  const parentLayout =
    parentPath && openedAt[parentPath]
      ? aboveFolder(parentPacked, openedAt[parentPath], parentPath.includes('/') ? 126 : WIDTH)
      : parentPacked;
  const cardWidth = WIDTH;
  const cardHeight = HEIGHT;
  const active = allEntries.find((entry) => entry.path === selected);
  const previewEntry = allEntries.find((entry) => entry.path === (hovered ?? selected));
  const previewData = previewEntry ? mediaPreviews[previewEntry.path] : undefined;
  const openedFolder = background.find((entry) => entry.path === path);
  const parentPoint = (entry: DocumentEntry, index: number) =>
    entry.path.includes('/')
      ? (parentLayout.cards[entry.path] ?? initialPoint(index))
      : (layout[layoutKey(entry)] ?? initialPoint(index));
  const folderOrigin = openedFolder
    ? (openedAt[path] ?? parentPoint(openedFolder, background.indexOf(openedFolder)))
    : { x: 412, y: 360 };
  // Opening a folder changes what is shown, never where that folder lives.
  const folderPoint = folderOrigin;
  const folderWidth = parentPath ? 126 : WIDTH;
  const folderHeight = parentPath ? 122 : HEIGHT;
  const folderLayout =
    heldLayout ?? (path ? aboveFolder(packed, folderOrigin, folderWidth) : packed);
  const position = (entry: DocumentEntry): Point => {
    if (path)
      return dragging === entry.path && dragPoint
        ? dragPoint
        : (folderLayout.cards[entry.path] ?? {
            x: folderPoint.x + WIDTH + FOLDER_CONTENT_GAP,
            y: folderPoint.y,
          });
    return (
      layout[layoutKey(entry)] ??
      initialPoint(
        Math.max(
          0,
          allEntries.findIndex((item) => item.path === entry.path),
        ),
      )
    );
  };
  const stageWidth = path
    ? Math.max(
        1000,
        folderPoint.x + cardWidth + 50,
        folderLayout.bounds.x + folderLayout.bounds.width + 50,
      )
    : Math.max(1000, ...shown.map((entry) => position(entry).x + cardWidth + 50));
  const stageHeight = path
    ? Math.max(
        490,
        folderPoint.y + HEIGHT + 70,
        folderLayout.bounds.y + folderLayout.bounds.height + 55,
      )
    : Math.max(490, ...shown.map((entry) => position(entry).y + cardHeight + 55));
  // The world moves beneath a fixed viewport. Extending these virtual scrollbar
  // bounds never clamps the camera or changes the point held by the pointer.
  const minX = Math.min(-PAN_MARGIN, -camera.x);
  const minY = Math.min(-PAN_MARGIN, -camera.y);
  const scrollMetrics: ScrollMetrics = {
    ...viewportSize,
    left: -camera.x - minX,
    top: -camera.y - minY,
    scrollWidth: Math.max(stageWidth * zoom + PAN_MARGIN, viewportSize.width - camera.x) - minX,
    scrollHeight: Math.max(stageHeight * zoom + PAN_MARGIN, viewportSize.height - camera.y) - minY,
  };
  function moveCamera(next: Point) {
    cameraAnimation.current?.cancel();
    cameraRef.current = next;
    setCamera(next);
  }
  function updateViewportSize() {
    const element = viewport.current;
    if (!element) return;
    setViewportSize({ width: element.clientWidth, height: element.clientHeight });
  }
  function scrollCanvasTo(axis: 'horizontal' | 'vertical', value: number) {
    moveCamera({
      ...cameraRef.current,
      ...(axis === 'horizontal' ? { x: -value - minX } : { y: -value - minY }),
    });
  }

  function stopPan() {
    if (pan.current) suppressPanClick.current = pan.current.primary && pan.current.moved;
    pan.current = null;
    setPanning(false);
  }

  useEffect(() => {
    const cancel = () => {
      if (pan.current) suppressPanClick.current = pan.current.primary && pan.current.moved;
      pan.current = null;
      setPanning(false);
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('pointerup', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointerup', cancel);
    };
  }, []);

  function setCanvasZoom(value: number, clientX?: number, clientY?: number) {
    const element = viewport.current;
    const next = clampZoom(value);
    if (!element || gesture.current || next === zoomRef.current) return;
    const bounds = element.getBoundingClientRect();
    const x = clientX === undefined ? element.clientWidth / 2 : clientX - bounds.left;
    const y = clientY === undefined ? element.clientHeight / 2 : clientY - bounds.top;
    const previous = zoomRef.current;
    const canvasX = (x - cameraRef.current.x) / previous;
    const canvasY = (y - cameraRef.current.y) / previous;
    customZoom.current = true;
    zoomRef.current = next;
    setZoom(next);
    moveCamera({ x: x - canvasX * next, y: y - canvasY * next });
  }

  const handleWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    if (pan.current || gesture.current) return;
    if (event.ctrlKey || event.metaKey) {
      setCanvasZoom(zoomRef.current * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    } else {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportSize.height : 1;
      const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
      moveCamera({ x: cameraRef.current.x - dx * unit, y: cameraRef.current.y - dy * unit });
    }
  });

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => handleWheel(event);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function fitCanvas() {
    const element = viewport.current;
    if (!element || gesture.current) return;
    if (path) {
      fitFolder();
      return;
    }
    const next = clampZoom(
      Math.min(
        (element.clientWidth - 48) / stageWidth,
        (element.clientHeight - 48) / stageHeight,
        1,
      ),
    );
    customZoom.current = true;
    zoomRef.current = next;
    setZoom(next);
    moveCamera({ x: 0, y: 0 });
  }

  function closeFolder() {
    if (!path || disabled || closingFolder) return;
    setClosingFolder(true);
    closeTimer.current = window.setTimeout(
      () => {
        closeTimer.current = null;
        setClosingFolder(false);
        onBack();
      },
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : FOLDER_CLOSE_MS,
    );
  }

  function fitFolder() {
    const element = viewport.current;
    if (!element || !element.clientWidth || !element.clientHeight) return;
    const left = Math.min(folderLayout.bounds.x, folderPoint.x) - 48;
    const top = Math.min(folderLayout.bounds.y, folderPoint.y) - 64;
    const right =
      Math.max(folderLayout.bounds.x + folderLayout.bounds.width, folderPoint.x + folderWidth) + 48;
    const bottom = folderPoint.y + folderHeight + 40;
    const nextZoom = clampZoom(
      Math.min(
        zoomRef.current,
        element.clientWidth / (right - left),
        element.clientHeight / (bottom - top),
      ),
    );
    const previous = cameraRef.current;
    const next = {
      x: (element.clientWidth - (right - left) * nextZoom) / 2 - left * nextZoom,
      y: (element.clientHeight - (bottom - top) * nextZoom) / 2 - top * nextZoom,
    };
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    moveCamera(next);
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && world.current?.animate)
      cameraAnimation.current = world.current.animate(
        [
          { transform: `translate(${previous.x}px, ${previous.y}px)` },
          { transform: `translate(${next.x}px, ${next.y}px)` },
        ],
        { duration: FOLDER_OPEN_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
  }
  const revealFolder = useEffectEvent(fitFolder);

  useEffect(() => {
    if (!path || loading) return;
    viewport.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => revealFolder());
    return () => cancelAnimationFrame(frame);
  }, [path, loading]);

  useEffect(() => {
    if (path) return;
    const frame = requestAnimationFrame(() => setClosingFolder(false));
    return () => cancelAnimationFrame(frame);
  }, [path]);

  useEffect(
    () => () => {
      cameraAnimation.current?.cancel();
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (parentHoldTimer.current !== null) window.clearTimeout(parentHoldTimer.current);
    },
    [],
  );

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    },
    [path],
  );

  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!customZoom.current) {
        const next = clampZoom(Math.min(0.85, (element.clientWidth - 24) / 1000));
        zoomRef.current = next;
        setZoom(next);
      }
      updateViewportSize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(updateViewportSize);
    return () => cancelAnimationFrame(frame);
  }, [zoom, stageWidth, stageHeight, shown.length]);

  // Allocate positions once, so adding, removing, or sorting files does not move neighbours.
  useEffect(() => {
    if (path || !allEntries.some((entry) => !layout[layoutKey(entry)])) return;
    const next = { ...layout };
    for (const entry of allEntries) {
      if (next[layoutKey(entry)]) continue;
      let index = 0;
      const initial = initialPoint;
      let point = initial(index);
      while (
        allEntries.some((other) => {
          const occupied = next[layoutKey(other)];
          return (
            occupied &&
            Math.abs(occupied.x - point.x) < cardWidth + 24 &&
            Math.abs(occupied.y - point.y) < cardHeight + 24
          );
        })
      )
        point = initial(++index);
      next[layoutKey(entry)] = point;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLayout(next);
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        setStorageError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allEntries, layout, path, cardWidth, cardHeight]);

  useEffect(() => {
    function dismiss(event: globalThis.PointerEvent) {
      if (settings.current && !settings.current.contains(event.target as Node))
        settings.current.open = false;
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  useEffect(() => {
    if (!canEdit || moving || loading) return;
    let cancelled = false;
    const sourceEntries = Array.from(
      new Map([...allEntries, ...background].map((entry) => [entry.path, entry])).values(),
    );
    const notes = sourceEntries
      .filter((entry) => editable(entry) && entry.size <= 2 * 1024 * 1024)
      .slice(0, 24);
    const media = sourceEntries
      .filter((entry) => previewable(entry) && entry.size <= 12 * 1024 * 1024)
      .slice(0, 24);
    const keep = new Set(sourceEntries.map((entry) => entry.path));
    const pending = [...notes, ...media];
    let frame: number;
    // Decode and mount at most two new previews per frame. Promise.all over the
    // whole folder made one enormous React commit immediately after the flight.
    const loadBatch = async () => {
      const batch = pending.splice(0, 2);
      const values = await Promise.all(
        batch.map(async (entry) => {
          try {
            return {
              path: entry.path,
              data: editable(entry) ? await loadNotePreview(entry) : await loadPreview(entry),
            };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const noteValues: Record<string, string> = {};
      const mediaValues: Record<string, DocumentPreviewData> = {};
      for (const value of values) {
        if (!value) continue;
        if (typeof value.data === 'string') noteValues[value.path] = value.data;
        else mediaValues[value.path] = value.data;
      }
      if (Object.keys(noteValues).length)
        setPreviews((previous) =>
          Object.fromEntries(
            Object.entries({ ...previous, ...noteValues }).filter(([key]) => keep.has(key)),
          ),
        );
      if (Object.keys(mediaValues).length)
        setMediaPreviews((previous) =>
          Object.fromEntries(
            Object.entries({ ...previous, ...mediaValues }).filter(([key]) => keep.has(key)),
          ),
        );
      if (pending.length)
        frame = requestAnimationFrame(() => {
          void loadBatch();
        });
    };
    frame = requestAnimationFrame(() => {
      void loadBatch();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [allEntries, background, canEdit, moving, loading]);

  function persist(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function setParentDropState(next: 'pending' | 'ready' | null) {
    parentDropRef.current = next;
    setParentDrop(next);
  }
  function clearParentDrop() {
    if (parentHoldTimer.current !== null) window.clearTimeout(parentHoldTimer.current);
    parentHoldTimer.current = null;
    setParentDropState(null);
  }
  function finish(event?: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (event?.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const moveToParent = !cancelled && parentDropRef.current === 'ready' && path;
    const wasOverParent = parentDropRef.current !== null;
    clearParentDrop();
    setDragging(null);
    setDropTarget(null);
    setDragPoint(null);
    setHeldLayout(null);
    if (!current.moved) return;
    suppressClick.current = true;
    if (path || cancelled || dropTarget || wasOverParent) {
      if (!path)
        setLayout((previous) => ({
          ...previous,
          [layoutKey(current.entry)]: { ...previous[layoutKey(current.entry)], ...current.origin },
        }));
      if (moveToParent) {
        const parent = path.split('/').slice(0, -1).join('/');
        void onMove(current.entry, parent).then((moved) => {
          if (moved) {
            if (!parent && dragPoint)
              persist({
                ...layout,
                [current.entry.name]: {
                  ...dragPoint,
                  pinned: !!layout[current.entry.path]?.pinned,
                },
              });
            onBack();
          }
        });
      } else if (!cancelled && dropTarget) void onMove(current.entry, dropTarget);
    } else {
      persist(layout);
      setAnnouncement(`${current.entry.name} repositioned.`);
    }
  }

  const cancelDrag = useEffectEvent(() => finish(undefined, true));
  useEffect(() => {
    const cancel = () => cancelDrag();
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);

  return (
    <div
      className={cn(
        'document-canvas',
        path && 'is-folder-focused',
        closingFolder && 'is-folder-closing',
        parentDrop === 'ready' && 'is-parent-revealed',
      )}
      aria-label="Document canvas"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (!/INPUT|TEXTAREA|SELECT/.test(target.tagName) && !target.isContentEditable) {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            setCanvasZoom(zoomRef.current * 1.2);
          } else if (event.key === '-') {
            event.preventDefault();
            setCanvasZoom(zoomRef.current / 1.2);
          } else if (event.key === '0') {
            event.preventDefault();
            setCanvasZoom(1);
          } else if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            fitCanvas();
          }
        }
        if (event.key === 'Escape') {
          if (gesture.current) {
            finish(undefined, true);
            return;
          }
          if (selected) onSelect(null);
          else if (path) closeFolder();
        }
      }}
    >
      {path && (
        <button
          className="canvas-folder-back"
          aria-label="Go to parent folder"
          disabled={disabled || closingFolder}
          onClick={closeFolder}
        >
          <ArrowLeft size={15} />
          <FolderOpen size={15} />
          <span>{path.split('/').at(-1)}</span>
        </button>
      )}
      {path && dragging && (
        <div
          className={cn('canvas-parent-drop', parentDrop && `is-${parentDrop}`)}
          aria-live="polite"
        >
          <ArrowLeft size={15} />
          <span>
            {parentDrop === 'ready'
              ? 'Release to move out of this folder'
              : parentDrop === 'pending'
                ? 'Keep holding to move out…'
                : 'Drag outside the collection and hold to move out'}
          </span>
          {parentDrop === 'pending' && <span className="canvas-parent-progress" aria-hidden />}
        </div>
      )}
      {pinnedOnly && (
        <button className="canvas-pinned-indicator" onClick={() => setPinnedOnlyPath(null)}>
          <Pin size={12} /> Pinned only · Show all
        </button>
      )}
      <div
        ref={viewport}
        tabIndex={-1}
        className={cn(
          'canvas-viewport',
          hand && 'is-hand',
          panning && 'is-panning',
          fileHover && 'is-file-hover',
        )}
        aria-label="Canvas workspace"
        aria-busy={loading || disabled}
        onClickCapture={(event) => {
          if (suppressPanClick.current || hand) {
            suppressPanClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            path &&
            !disabled &&
            !closingFolder &&
            !hand &&
            (target === event.currentTarget ||
              target.classList.contains('canvas-stage') ||
              target.classList.contains('canvas-space') ||
              target.classList.contains('canvas-world'))
          )
            closeFolder();
        }}
        onDragOver={(event) => {
          if (canEdit && !disabled && event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setFileHover(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileHover(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setFileHover(false);
          if (canEdit && !disabled && event.dataTransfer.files.length)
            onImport(Array.from(event.dataTransfer.files));
        }}
        onPointerDown={(event) => {
          if ((hand && event.button === 0) || event.button === 1) {
            event.preventDefault();
            suppressPanClick.current = false;
            setPanning(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            pan.current = {
              start: { x: event.clientX, y: event.clientY },
              origin: cameraRef.current,
              moved: false,
              primary: event.button === 0,
            };
          } else if (
            event.button === 0 &&
            (event.target === event.currentTarget ||
              (event.target as HTMLElement).classList.contains('canvas-stage'))
          )
            onSelect(null);
        }}
        onPointerMove={(event) => {
          if (pan.current) {
            if (
              Math.hypot(event.clientX - pan.current.start.x, event.clientY - pan.current.start.y) >
              3
            )
              pan.current.moved = true;
            moveCamera({
              x: pan.current.origin.x + event.clientX - pan.current.start.x,
              y: pan.current.origin.y + event.clientY - pan.current.start.y,
            });
          }
        }}
        onPointerUp={(event) => {
          stopPan();
          if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={stopPan}
        onLostPointerCapture={stopPan}
        onAuxClick={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
      >
        <div
          ref={world}
          className="canvas-world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px)` }}
        >
          {path && background.length > 0 && (
            <div className="canvas-background" aria-hidden>
              {background.map((entry, index) => (
                <div
                  key={entry.path}
                  className={cn(
                    'canvas-card',
                    `tone-${colorFor(entry)}`,
                    entry.path.includes('/') && 'is-packed',
                  )}
                  style={
                    {
                      visibility: entry.path === path ? 'hidden' : undefined,
                      left: parentPoint(entry, index).x * zoom,
                      top: parentPoint(entry, index).y * zoom,
                      width: entry.path.includes('/')
                        ? parentLayout.cards[entry.path]?.width
                        : undefined,
                      height: entry.path.includes('/')
                        ? parentLayout.cards[entry.path]?.height
                        : undefined,
                      '--surrounding-scale': `${zoom}`,
                      transform: `scale(${zoom})`,
                    } as CSSProperties
                  }
                >
                  <CardContent
                    canPreviewFolders={canEdit}
                    entry={entry}
                    preview={previews[entry.path]}
                    thumbnail={mediaPreviews[entry.path]}
                    frame={entry.path.includes('/') ? parentLayout.cards[entry.path] : undefined}
                  />
                </div>
              ))}
            </div>
          )}
          {path && (
            <div
              className="canvas-focus-wash"
              aria-hidden
              style={{
                left: -camera.x,
                top: -camera.y,
                width: scrollMetrics.width,
                height: scrollMetrics.height,
              }}
            />
          )}
          {openedFolder && (
            <button
              type="button"
              className={cn(
                'canvas-card',
                `tone-${colorFor(openedFolder)}`,
                'canvas-opened-folder',
                parentPath && 'is-packed',
              )}
              aria-label={`Close ${openedFolder.name} folder`}
              disabled={disabled || closingFolder}
              onClick={closeFolder}
              style={{
                left: folderPoint.x * zoom,
                top: folderPoint.y * zoom,
                width: folderWidth,
                height: folderHeight,
                transform: `scale(${zoom})`,
              }}
            >
              <CardContent
                entry={openedFolder}
                preview={previews[openedFolder.path]}
                thumbnail={mediaPreviews[openedFolder.path]}
              />
            </button>
          )}
          <div
            className={cn('canvas-space', path && 'is-focused', closingFolder && 'is-closing')}
            style={{
              width: stageWidth * zoom,
              height: stageHeight * zoom,
            }}
          >
            <div
              className="canvas-stage"
              style={{
                left: 0,
                top: 0,
                width: stageWidth,
                height: stageHeight,
                transform: `scale(${zoom})`,
              }}
            >
              {path && dragging && folderLayout.cards[dragging] && (
                <div
                  className="canvas-slot-placeholder"
                  aria-hidden
                  style={{
                    left: folderLayout.cards[dragging].x,
                    top: folderLayout.cards[dragging].y,
                    width: folderLayout.cards[dragging].width,
                    height: folderLayout.cards[dragging].height,
                  }}
                />
              )}
              {loading ? (
                <p className="canvas-empty">Loading your study space…</p>
              ) : (
                shown.map((entry, index) => {
                  const point = position(entry);
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      aria-label={`Select ${entry.name}`}
                      aria-pressed={selected === entry.path}
                      disabled={disabled || closingFolder}
                      className={cn(
                        'canvas-card',
                        `tone-${colorFor(entry)}`,
                        path && 'is-packed',
                        selected === entry.path && 'is-selected',
                        dragging === entry.path && 'is-dragging',
                        dropTarget === entry.path && 'is-drop-target',
                      )}
                      style={
                        {
                          left: point.x,
                          top: point.y,
                          width: path ? folderLayout.cards[entry.path]?.width : undefined,
                          height: path ? folderLayout.cards[entry.path]?.height : undefined,
                          animationDelay: `${Math.min(index, FOLDER_STAGGER_LIMIT) * FOLDER_STAGGER_MS}ms`,
                          '--folder-open-ms': `${FOLDER_OPEN_MS}ms`,
                          '--folder-close-ms': `${FOLDER_CLOSE_MS}ms`,
                          '--reveal-x': `${folderPoint.x + folderWidth / 2 - point.x}px`,
                          '--reveal-y': `${folderPoint.y + 42 - point.y}px`,
                          '--reveal-angle': `${((index % 3) - 1) * 5}deg`,
                        } as CSSProperties
                      }
                      onClick={() => {
                        if (hand || suppressPanClick.current) return;
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        if (entry.folder) {
                          setOpenedAt((previous) => ({ ...previous, [entry.path]: point }));
                          onOpen(entry);
                          return;
                        }
                        onSelect(entry.path);
                      }}
                      onDoubleClick={() => {
                        if (!entry.folder) onOpen(entry);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (entry.folder)
                            setOpenedAt((previous) => ({ ...previous, [entry.path]: point }));
                          onOpen(entry);
                        }
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          if (gesture.current) {
                            finish(undefined, true);
                            return;
                          }
                          if (selected) onSelect(null);
                          else if (path) closeFolder();
                        }
                        const directions: Record<string, Point> = {
                          ArrowLeft: { x: -16, y: 0 },
                          ArrowRight: { x: 16, y: 0 },
                          ArrowUp: { x: 0, y: -16 },
                          ArrowDown: { x: 0, y: 16 },
                        };
                        if (event.altKey && directions[event.key]) {
                          if (path) {
                            event.preventDefault();
                            return;
                          }
                          event.preventDefault();
                          const delta = directions[event.key];
                          if (!delta) return;
                          persist({
                            ...layout,
                            [layoutKey(entry)]: {
                              ...layout[layoutKey(entry)],
                              x: Math.max(12, point.x + delta.x),
                              y: Math.max(12, point.y + delta.y),
                            },
                          });
                        }
                      }}
                      onPointerDown={(event) => {
                        if (hand || event.button !== 0) return;
                        event.stopPropagation();
                        suppressClick.current = false;
                        setHovered(null);
                        clearParentDrop();
                        if (path) setHeldLayout(folderLayout);
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        gesture.current = {
                          entry,
                          start: { x: event.clientX, y: event.clientY },
                          origin: { x: point.x, y: point.y },
                          moved: false,
                        };
                      }}
                      onPointerMove={(event) => {
                        const current = gesture.current;
                        if (!current || current.entry.path !== entry.path) return;
                        const dx = (event.clientX - current.start.x) / zoom;
                        const dy = (event.clientY - current.start.y) / zoom;
                        if (!current.moved && Math.hypot(dx, dy) < 5) return;
                        current.moved = true;
                        setDragging(entry.path);
                        onSelect(entry.path);
                        const bounds = viewport.current?.getBoundingClientRect();
                        const pointer = bounds
                          ? {
                              x: (event.clientX - bounds.left - cameraRef.current.x) / zoom,
                              y: (event.clientY - bounds.top - cameraRef.current.y) / zoom,
                            }
                          : null;
                        const overParent = Boolean(
                          path && canEdit && pointer && outsideFolder(pointer, folderLayout.bounds),
                        );
                        if (overParent && !parentDropRef.current) {
                          setParentDropState('pending');
                          parentHoldTimer.current = window.setTimeout(() => {
                            parentHoldTimer.current = null;
                            setParentDropState('ready');
                          }, PARENT_HOLD_MS);
                        } else if (!overParent && parentDropRef.current) clearParentDrop();
                        const next = {
                          x: path ? current.origin.x + dx : Math.max(12, current.origin.x + dx),
                          y: path ? current.origin.y + dy : Math.max(12, current.origin.y + dy),
                        };
                        if (path) setDragPoint(next);
                        else
                          setLayout((previous) => ({
                            ...previous,
                            [layoutKey(entry)]: { ...previous[layoutKey(entry)], ...next },
                          }));
                        const target = canEdit
                          ? shown.find((other) => {
                              const at = position(other);
                              const size = path
                                ? folderLayout.cards[other.path]
                                : { width: cardWidth, height: cardHeight };
                              if (!size) return false;
                              const draggedSize = path
                                ? folderLayout.cards[entry.path]
                                : { width: cardWidth, height: cardHeight };
                              if (!draggedSize) return false;
                              return (
                                other.folder &&
                                other.path !== entry.path &&
                                next.x + draggedSize.width / 2 >= at.x &&
                                next.x + draggedSize.width / 2 <= at.x + size.width &&
                                next.y + draggedSize.height / 2 >= at.y &&
                                next.y + draggedSize.height / 2 <= at.y + size.height
                              );
                            })
                          : null;
                        setDropTarget(overParent ? null : (target?.path ?? null));
                      }}
                      onPointerUp={(event) => finish(event)}
                      onPointerCancel={(event) => finish(event, true)}
                      onLostPointerCapture={(event) => finish(event, true)}
                      onPointerEnter={() => setHovered(entry.path)}
                      onPointerLeave={() =>
                        setHovered((previous) => (previous === entry.path ? null : previous))
                      }
                    >
                      <div className="canvas-card-visual">
                        <CardContent
                          lightweight={moving}
                          canPreviewFolders={canEdit}
                          entry={entry}
                          preview={previews[entry.path]}
                          thumbnail={mediaPreviews[entry.path]}
                          pinned={layout[entry.path]?.pinned}
                          frame={path ? folderLayout.cards[entry.path] : undefined}
                          onMeasure={reportDimensions}
                        />
                      </div>
                      {dropTarget === entry.path && (
                        <span className="canvas-drop-label">Move into folder</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      {previewEntry && !dragging && !disabled && !moving && (
        <aside className="canvas-quicklook" aria-label={`Preview of ${previewEntry.name}`}>
          <div className="canvas-quicklook-heading">
            <span>{fileKind(previewEntry)}</span>
            <strong>{previewEntry.name}</strong>
          </div>
          {previewData ? (
            <div className="canvas-quicklook-media">
              <DocumentThumbnail data={previewData} alt={`${previewEntry.name} preview`} />
            </div>
          ) : editable(previewEntry) ? (
            <div className="canvas-quicklook-note">
              <NoteVisualPreview
                name={previewEntry.name}
                path={previewEntry.path}
                content={previews[previewEntry.path] ?? ''}
                size="large"
              />
            </div>
          ) : (
            <p className="canvas-quicklook-text">
              {previewEntry.folder
                ? 'Open this folder to see its contents.'
                : `${fileSize(previewEntry.size)} · Open to view`}
            </p>
          )}
        </aside>
      )}
      {!loading && !shown.length && (
        <div className="canvas-empty">
          {query ? (
            <p>No matching documents</p>
          ) : pinnedOnly ? (
            <p>Pin a document to keep it here.</p>
          ) : (
            <>
              <button
                className="canvas-empty-start"
                disabled={!canEdit || disabled}
                onClick={onCreate}
              >
                Start a note or drop something in
              </button>
              {!canEdit && (
                <p className="canvas-browser-hint">
                  Open the desktop app to work with your local files.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {fileHover && (
        <div className="canvas-import-overlay">
          <Upload size={30} />
          <strong>Drop into {path.split('/').at(-1) || 'your study space'}</strong>
          <span>Your original files stay where they are.</span>
        </div>
      )}
      <CanvasScrollbar axis="vertical" metrics={scrollMetrics} onScrollTo={scrollCanvasTo} />
      <CanvasScrollbar axis="horizontal" metrics={scrollMetrics} onScrollTo={scrollCanvasTo} />
      <div className="canvas-bottomline">
        <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom">
          <IconButton
            label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setCanvasZoom(zoomRef.current / 1.2)}
          >
            <Minus size={15} />
          </IconButton>
          <button
            className="canvas-zoom-value"
            title="Reset zoom to 100%"
            onClick={() => setCanvasZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setCanvasZoom(zoomRef.current * 1.2)}
          >
            <Plus size={15} />
          </IconButton>
          <span className="canvas-tool-divider" />
          <IconButton label="Fit canvas" onClick={fitCanvas}>
            <Maximize size={14} />
          </IconButton>
        </div>
        <details
          ref={settings}
          className="canvas-settings"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
        >
          <summary
            aria-label="Canvas options"
            title="Canvas options"
            className="canvas-floating-button"
          >
            <SlidersHorizontal size={16} />
          </summary>
          <div className="canvas-settings-panel">
            <p className="canvas-menu-label">CANVAS</p>
            <div className="canvas-tools">
              <IconButton
                label="Select and move"
                aria-pressed={!hand}
                onClick={() => setHand(false)}
                className={!hand ? 'bg-surface-hover' : ''}
              >
                <MousePointer2 size={15} />
              </IconButton>
              <IconButton
                label="Pan canvas"
                aria-pressed={hand}
                onClick={() => setHand(true)}
                className={hand ? 'bg-surface-hover' : ''}
              >
                <Hand size={15} />
              </IconButton>
            </div>
            <button
              className="canvas-menu-item"
              aria-pressed={pinnedOnly}
              onClick={() => setPinnedOnlyPath(pinnedOnly ? null : path)}
            >
              <Pin size={15} />
              {pinnedOnly ? 'Show all documents' : 'Show pinned only'}
            </button>
            {options}
            <p className="canvas-shortcuts">
              {path
                ? 'Automatically arranged · Double-click to open'
                : 'Drag to arrange · Double-click to open'}
              <br />
              {path
                ? 'Drag outside and hold to move to the parent folder'
                : 'Alt + arrow keys to move a selected item'}
              <br />
              Pinch to zoom · + / − to zoom · 0 to reset · F to fit
              <br />
              Hold the mouse wheel (middle button) and drag to pan
            </p>
          </div>
        </details>
        {active && (
          <button
            className="canvas-filter"
            aria-pressed={!!layout[active.path]?.pinned}
            onClick={() =>
              persist({
                ...layout,
                [active.path]: {
                  ...(layout[active.path] ?? position(active)),
                  pinned: !layout[active.path]?.pinned,
                },
              })
            }
          >
            <Pin size={13} />
            {layout[active.path]?.pinned ? 'Unpin' : 'Pin for studying'}
          </button>
        )}
      </div>
      {storageError && (
        <p role="alert" className="px-5 pb-2 text-xs text-danger">
          This layout could not be saved. Your documents are safe; positions will reset when you
          reopen.
        </p>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
