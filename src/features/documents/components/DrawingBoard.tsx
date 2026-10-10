import { lazy, Suspense, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import {
  createAutosaver,
  type Autosaver,
  type AutosaveState,
} from '@/features/documents/lib/autosave';
import { documentRequest } from '@/features/documents/lib/files';
import { createDrawingPreset, type DrawingPresetId } from '@/features/documents/lib/drawingPresets';
import { DrawingInsertPalette } from './DrawingInsertPalette';
import { FocusModeButton } from './FocusModeButton';
import { SaveStatus } from './SaveStatus';
import '@excalidraw/excalidraw/index.css';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// The fonts ship with the app (see vite.config.ts). Otherwise Excalidraw loads
// them from a CDN, which the desktop CSP blocks and which would not work offline.
if (typeof window !== 'undefined')
  window.EXCALIDRAW_ASSET_PATH = new URL(
    `${import.meta.env.BASE_URL}excalidraw/`,
    window.location.href,
  ).href;

const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then(({ Excalidraw }) => ({ default: Excalidraw })),
);
type ExcalidrawModule = typeof import('@excalidraw/excalidraw');
type Scene = Parameters<ExcalidrawModule['restore']>[0];
type SceneChange = NonNullable<ExcalidrawProps['onChange']>;

// Drawings made before they were saved to disk lived in browser storage.
const LEGACY_STORAGE_PREFIX = 'uni-pilot:study-drawing:v1:';

/** The hidden drawing beside a note, e.g. `Biology/.Notes.md.excalidraw`. */
function drawingPathForDocument(path: string) {
  const parts = path.split('/');
  const fileName = parts.pop() || 'note.md';
  return [...parts, `.${fileName}.excalidraw`].join('/');
}

function parseScene(stored: string | null): Scene {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('elements' in parsed)) return null;
    const scene = parsed as Record<string, unknown>;
    if (!scene.appState || typeof scene.appState !== 'object') return scene;
    // Older saves stringified the collaborators Map into `{}`, which Excalidraw
    // would then iterate as a Map.
    const appState = { ...(scene.appState as Record<string, unknown>) };
    delete appState.collaborators;
    return { ...scene, appState };
  } catch {
    return null;
  }
}

// Excalidraw reports every pointer move and scroll; only element or image
// changes are worth a save.
function sceneVersion(
  module: ExcalidrawModule,
  elements: Parameters<ExcalidrawModule['hashElementsVersion']>[0],
  files: object,
) {
  return `${module.hashElementsVersion(elements)}:${Object.keys(files).length}`;
}

function readLegacy(notePath: string) {
  try {
    return localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${notePath}`);
  } catch {
    return null;
  }
}

export interface DrawingHandle {
  /** Saves pending changes now. */
  flush(): Promise<void>;
  readonly clean: boolean;
}

interface DrawingBoardProps {
  notePath: string;
  ref?: Ref<DrawingHandle>;
}

/**
 * The note's drawing board. It saves itself like the text does, as a standard
 * `.excalidraw` file that excalidraw.com and Obsidian's Excalidraw plugin open.
 */
export function DrawingBoard({ notePath, ref }: DrawingBoardProps) {
  const sidecar = drawingPathForDocument(notePath);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [status, setStatus] = useState<AutosaveState>({ kind: 'saved' });
  const excalidraw = useRef<ExcalidrawModule | null>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const autosaver = useRef<Autosaver | null>(null);
  const version = useRef('');
  const boardElement = useRef<HTMLDivElement>(null);
  const insertCount = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      flush: () => autosaver.current?.flush() ?? Promise.resolve(),
      get clean() {
        return autosaver.current?.clean ?? true;
      },
    }),
    [],
  );

  useEffect(() => {
    let active = true;
    let saver: Autosaver | null = null;
    void (async () => {
      const module = await import('@excalidraw/excalidraw');
      let stored: string | null = null;
      try {
        stored = await documentRequest<string>({ action: 'readDrawing', path: sidecar });
      } catch {
        // No drawing yet.
      }
      const legacy = stored === null ? readLegacy(notePath) : null;
      const scene = parseScene(stored ?? legacy);
      const restored = scene ? module.restore(scene, null, null) : null;
      if (!active) return;
      excalidraw.current = module;
      version.current = sceneVersion(module, restored?.elements ?? [], restored?.files ?? {});
      // Until the board has mounted, the loaded scene is what a save would write.
      const loaded = restored
        ? module.serializeAsJSON(restored.elements, restored.appState, restored.files, 'local')
        : '';
      saver = createAutosaver({
        disk: stored ?? '',
        baseline: stored ?? '',
        read: () => {
          const board = api.current;
          return board
            ? module.serializeAsJSON(
                board.getSceneElements(),
                board.getAppState(),
                board.getFiles(),
                'local',
              )
            : loaded;
        },
        write: async (content) => {
          await documentRequest({ action: 'saveDrawing', path: sidecar, content });
          return { status: 'saved' };
        },
        onState: setStatus,
      });
      autosaver.current = saver;
      // A drawing still only in browser storage moves to disk right away.
      if (legacy && restored) saver.change();
      setInitialData(restored);
      setReady(true);
    })();
    return () => {
      active = false;
      void saver?.flush();
      saver?.dispose();
      autosaver.current = null;
    };
  }, [notePath, sidecar]);

  const onChange: SceneChange = (elements, _appState, files) => {
    const module = excalidraw.current;
    if (!module) return;
    const next = sceneVersion(module, elements, files);
    if (next === version.current) return;
    version.current = next;
    autosaver.current?.change();
  };

  async function insert(id: DrawingPresetId) {
    const board = api.current;
    const module = excalidraw.current;
    const bounds = boardElement.current?.getBoundingClientRect();
    if (!board || !module || !bounds) return;
    setInsertError('');
    try {
      // Excalidraw measures bound labels with its loaded fonts.
      await document.fonts.ready;
      if (api.current !== board) return;
      const appState = board.getAppState();
      const center = module.viewportCoordsToSceneCoords(
        { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 },
        appState,
      );
      const offset = (insertCount.current++ % 5) * 24;
      const preset = createDrawingPreset(id, { x: center.x + offset, y: center.y + offset });
      const created = module.convertToExcalidrawElements(preset.elements, { regenerateIds: false });
      board.updateScene({
        elements: [...board.getSceneElements(), ...created],
        appState: {
          selectedElementIds: Object.fromEntries(created.map((element) => [element.id, true])),
        },
        captureUpdate: module.CaptureUpdateAction.IMMEDIATELY,
      });
      board.setActiveTool({ type: 'selection' });
      if (
        preset.width > (bounds.width / appState.zoom.value) * 0.75 ||
        preset.height > (bounds.height / appState.zoom.value) * 0.75
      ) {
        board.scrollToContent(created, {
          fitToViewport: true,
          viewportZoomFactor: 0.76,
          animate: true,
        });
      }
      autosaver.current?.change();
    } catch {
      setInsertError('This component could not be added. Please try again.');
    }
  }

  return (
    <section className="study-drawing-workspace" aria-label="Drawing">
      <div className="study-drawing-actions">
        <span>Visual notes · mind maps, diagrams and free-form thinking</span>
        <SaveStatus
          state={status}
          savedLabel="Drawing saved"
          onRetry={() => void autosaver.current?.flush()}
        />
      </div>
      {insertError ? (
        <p className="study-drawing-error" role="alert">
          {insertError}
        </p>
      ) : null}
      <div ref={boardElement} className="study-drawing-board">
        {!ready ? (
          <div className="study-drawing-loading">Loading your drawing…</div>
        ) : (
          <Suspense
            fallback={<div className="study-drawing-loading">Opening the drawing board…</div>}
          >
            <Excalidraw
              initialData={initialData}
              name={notePath.split('/').at(-1) ?? 'Drawing'}
              excalidrawAPI={(board) => {
                api.current = board;
                setCanvasReady(Boolean(board));
              }}
              UIOptions={{
                canvasActions: { export: { saveFileToDisk: false }, saveToActiveFile: false },
              }}
              onChange={onChange}
            />
          </Suspense>
        )}
        {/* The canvas's dock: what to add, then focus mode, floating at the bottom of the board. */}
        <DrawingInsertPalette disabled={!canvasReady} onInsert={(id) => void insert(id)}>
          <span className="drawing-dock-divider" aria-hidden />
          <FocusModeButton className="drawing-dock-button" />
        </DrawingInsertPalette>
      </div>
    </section>
  );
}
