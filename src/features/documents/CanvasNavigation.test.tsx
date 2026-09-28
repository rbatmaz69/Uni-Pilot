import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentCanvas } from './components/DocumentCanvas';
import { FOLDER_CLOSE_MS, FOLDER_SETTLE_MS } from './lib/canvasMotion';
import * as previewCache from './lib/previewCache';

const folder = { name: 'Biology', path: 'Biology', folder: true, size: 0, modified: 0 };
let frames: Map<number, FrameRequestCallback>;
let time: number;

beforeEach(() => {
  frames = new Map();
  time = performance.now();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  let id = 0;
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tick() {
  time += 16;
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(time)));
}

async function setup() {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const onMove = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <DocumentCanvas
      entries={[folder]}
      allEntries={[folder]}
      background={[]}
      path=""
      selected={null}
      disabled={false}
      loading={false}
      canEdit={false}
      query=""
      onSelect={onSelect}
      onOpen={onOpen}
      onMove={onMove}
      onImport={vi.fn()}
      onBack={vi.fn()}
      onCreate={vi.fn()}
      options={null}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const workspace = screen.getByLabelText('Canvas workspace');
  const setPointerCapture = vi.fn();
  Object.defineProperties(workspace, {
    clientWidth: { value: 900 },
    clientHeight: { value: 600 },
    setPointerCapture: { value: setPointerCapture },
  });
  tick();
  const world = view.container.querySelector<HTMLElement>('.canvas-world')!;
  const camera = () => {
    const coordinates = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!;
    return { x: Number(coordinates[1]), y: Number(coordinates[2]) };
  };
  return { ...view, workspace, world, camera, onOpen, onMove, onSelect, setPointerCapture };
}

describe('Canvas middle-button drag panning', () => {
  it('follows the mouse, stops when stationary or released, and leaves documents untouched', async () => {
    const { workspace, world, camera, onOpen, onMove, onSelect, setPointerCapture } = await setup();
    const card = screen.getByRole('button', { name: 'Select Biology' });
    const layout = localStorage.getItem('uni-pilot:document-canvas:v1');
    const position = card.getAttribute('style');
    const origin = camera();
    fireEvent.pointerDown(card, { button: 1, buttons: 4, clientX: 200, clientY: 200 });
    expect(workspace).toHaveClass('is-panning');
    expect(setPointerCapture).toHaveBeenCalled();
    fireEvent.pointerMove(workspace, { buttons: 4, clientX: 300, clientY: 260 });
    expect(camera().x).toBe(origin.x + 100);
    expect(camera().y).toBe(origin.y + 60);
    tick();
    expect(camera().x).toBe(origin.x + 100);
    expect(camera().y).toBe(origin.y + 60);
    fireEvent.pointerUp(workspace, { button: 1 });
    const stopped = camera().x;
    fireEvent.pointerMove(workspace, { clientX: 400, clientY: 300 });
    tick();
    expect(camera().x).toBe(stopped);
    expect(workspace).not.toHaveClass('is-panning');
    const auxClick = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    fireEvent(card, auxClick);
    expect(auxClick.defaultPrevented).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(card.getAttribute('style')).toBe(position);
    expect(workspace.scrollLeft).toBe(0);
    expect(workspace.scrollTop).toBe(0);
    expect(world).not.toContainElement(screen.getByRole('group', { name: 'Canvas zoom' }));
    expect(localStorage.getItem('uni-pilot:document-canvas:v1')).toBe(layout);
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(folder);
  });

  it('responds to small movements and reverses direction without changing zoom', async () => {
    const { workspace, camera } = await setup();
    const origin = camera();
    const zoom = screen.getByTitle('Reset zoom to 100%').textContent;
    fireEvent.pointerDown(workspace, { button: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(workspace, { clientX: 204, clientY: 204 });
    expect(camera().x).toBe(origin.x + 4);
    expect(camera().y).toBe(origin.y + 4);
    fireEvent.pointerMove(workspace, { clientX: 100, clientY: 100 });
    expect(camera().x).toBe(origin.x - 100);
    expect(camera().y).toBe(origin.y - 100);
    expect(screen.getByTitle('Reset zoom to 100%')).toHaveTextContent(zoom);
  });

  it.each(['blur', 'pointerup', 'pointercancel', 'lostpointercapture'])(
    'stops dragging on %s',
    async (event) => {
      const { workspace, camera } = await setup();
      fireEvent.pointerDown(workspace, { button: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(workspace, { clientX: 100, clientY: 100 });
      fireEvent(
        event === 'blur' || event === 'pointerup' ? window : workspace,
        new Event(event, { bubbles: true }),
      );
      const stopped = camera();
      fireEvent.pointerMove(workspace, { clientX: 400, clientY: 300 });
      expect(camera().x).toBe(stopped.x);
      expect(camera().y).toBe(stopped.y);
      expect(workspace).not.toHaveClass('is-panning');
    },
  );

  it('keeps left-button hand-tool panning and ignores right-button drags', async () => {
    const { workspace, camera, onSelect } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Pan canvas' }));
    const origin = camera().x;
    fireEvent.pointerDown(workspace, { button: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(workspace, { clientX: 300, clientY: 200 });
    expect(camera().x).toBe(origin);
    expect(workspace).not.toHaveClass('is-panning');
    fireEvent.pointerDown(workspace, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(workspace, { clientX: 300, clientY: 200 });
    expect(camera().x).toBe(origin + 100);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('pans beyond the old scroll boundaries and fits back to the documents', async () => {
    const { workspace, camera } = await setup();
    fireEvent.pointerDown(workspace, { button: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(workspace, { clientX: 5200, clientY: -4800 });
    expect(camera()).toEqual({ x: 5000, y: -5000 });
    expect(workspace.scrollLeft).toBe(0);
    expect(workspace.scrollTop).toBe(0);
    fireEvent.pointerUp(workspace, { button: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Fit canvas' }));
    expect(camera()).toEqual({ x: 0, y: 0 });
  });

  it('keeps the grabbed canvas point under the mouse at different zoom levels', async () => {
    const { workspace, camera } = await setup();
    for (const direction of ['Zoom in', 'Zoom out']) {
      fireEvent.click(screen.getByRole('button', { name: direction }));
      const zoom = Number.parseFloat(screen.getByTitle('Reset zoom to 100%').textContent) / 100;
      const origin = camera();
      const point = { x: (200 - origin.x) / zoom, y: (200 - origin.y) / zoom };
      fireEvent.pointerDown(workspace, { button: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(workspace, { clientX: 337, clientY: 126 });
      expect(point.x * zoom + camera().x).toBeCloseTo(337);
      expect(point.y * zoom + camera().y).toBeCloseTo(126);
      fireEvent.pointerUp(workspace, { button: 1 });
    }
  });

  it('keeps wheel navigation inside the canvas and anchors pinch zoom to the pointer', async () => {
    const { workspace, camera } = await setup();
    const wheel = new WheelEvent('wheel', {
      deltaX: 30,
      deltaY: 70,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(workspace, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(camera()).toEqual({ x: -30, y: -70 });
    const point = { x: (200 + 30) / 0.85, y: (200 + 70) / 0.85 };
    const pinch = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -20,
      clientX: 200,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(workspace, pinch);
    expect(pinch.defaultPrevented).toBe(true);
    const nextZoom = 0.85 * Math.exp(0.2);
    expect(point.x * nextZoom + camera().x).toBeCloseTo(200);
    expect(point.y * nextZoom + camera().y).toBeCloseTo(200);
    expect(workspace.scrollLeft).toBe(0);
    expect(workspace.scrollTop).toBe(0);
  });

  it('navigates the canvas with the scrollbar without scrolling its frame', async () => {
    const { workspace, camera } = await setup();
    const scrollbar = screen.getByRole('scrollbar', { name: 'Horizontal canvas scrollbar' });
    fireEvent.keyDown(scrollbar, { key: 'ArrowRight' });
    expect(camera()).toEqual({ x: -48, y: 0 });
    expect(workspace.scrollLeft).toBe(0);
  });
});

it('moves a held item out to its parent folder only after the hold completes', async () => {
  const file = {
    name: 'Lecture.bin',
    path: 'Biology/Lecture.bin',
    folder: false,
    size: 20,
    modified: 0,
  };
  const onMove = vi.fn().mockResolvedValue(true);
  const onBack = vi.fn();
  render(
    <DocumentCanvas
      entries={[file]}
      allEntries={[file]}
      background={[folder]}
      path="Biology"
      selected={null}
      disabled={false}
      loading={false}
      canEdit
      query=""
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      onMove={onMove}
      onImport={vi.fn()}
      onBack={onBack}
      onCreate={vi.fn()}
      options={null}
    />,
  );
  await act(async () => Promise.resolve());
  const workspace = screen.getByLabelText('Canvas workspace');
  vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const card = screen.getByRole('button', { name: 'Select Lecture.bin' });
  const left = card.style.left;
  fireEvent.pointerDown(card, { button: 0, clientX: 300, clientY: 200 });
  fireEvent.pointerMove(card, { clientX: 300, clientY: 60 });
  expect(screen.getByText('Keep holding to move out…')).toBeInTheDocument();
  fireEvent.pointerUp(card);
  expect(onMove).not.toHaveBeenCalled();
  expect(card.style.left).toBe(left);

  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(card, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(card, { clientX: 300, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText('Release to move out of this folder')).toBeInTheDocument();
    fireEvent.pointerUp(card);
    await act(async () => Promise.resolve());
    expect(onMove).toHaveBeenCalledWith(file, '');
    expect(onBack).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps assigned slots fixed, snaps back inside the folder, and cancels extraction', async () => {
  const files = ['A.bin', 'B.bin', 'C.bin'].map((name) => ({
    name,
    path: `Biology/${name}`,
    folder: false,
    size: 20,
    modified: 0,
  }));
  const onMove = vi.fn().mockResolvedValue(true);
  const onBack = vi.fn();
  const view = render(
    <DocumentCanvas
      entries={files}
      allEntries={files}
      background={[folder]}
      path="Biology"
      selected={null}
      disabled={false}
      loading={false}
      canEdit
      query=""
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      onMove={onMove}
      onImport={vi.fn()}
      onBack={onBack}
      onCreate={vi.fn()}
      options={null}
    />,
  );
  await act(async () => Promise.resolve());
  const card = screen.getByRole('button', { name: 'Select A.bin' });
  const neighbour = screen.getByRole('button', { name: 'Select B.bin' });
  const original = { left: card.style.left, top: card.style.top };
  const neighbourStyle = neighbour.getAttribute('style');
  const saved = localStorage.getItem('uni-pilot:document-canvas:v1');
  const x = (parseFloat(card.style.left) + parseFloat(card.style.width) / 2) * 0.85;
  const y = (parseFloat(card.style.top) + parseFloat(card.style.height) / 2) * 0.85;
  fireEvent.pointerDown(card, { button: 0, clientX: x, clientY: y });
  fireEvent.pointerMove(card, { clientX: x + 20, clientY: y + 10 });
  expect(card.style.left).not.toBe(original.left);
  expect(neighbour.getAttribute('style')).toBe(neighbourStyle);
  expect(view.container.querySelector('.canvas-slot-placeholder')).toBeInTheDocument();
  fireEvent.pointerUp(card);
  expect(card.style.left).toBe(original.left);
  expect(card.style.top).toBe(original.top);
  fireEvent.keyDown(card, { key: 'ArrowRight', altKey: true });
  expect(card.style.left).toBe(original.left);
  expect(localStorage.getItem('uni-pilot:document-canvas:v1')).toBe(saved);

  vi.useFakeTimers();
  try {
    for (const cancel of ['return', 'Escape', 'pointercancel', 'blur']) {
      fireEvent.pointerDown(card, { button: 0, clientX: x, clientY: y });
      fireEvent.pointerMove(card, { clientX: 950, clientY: y });
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(view.container.querySelector('.is-parent-revealed')).toBeInTheDocument();
      if (cancel === 'return') fireEvent.pointerMove(card, { clientX: x, clientY: y });
      else if (cancel === 'Escape') fireEvent.keyDown(card, { key: 'Escape' });
      else if (cancel === 'pointercancel') fireEvent.pointerCancel(card);
      else fireEvent.blur(window);
      expect(view.container.querySelector('.is-parent-revealed')).not.toBeInTheDocument();
      fireEvent.pointerUp(card);
      expect(card.style.left).toBe(original.left);
      expect(onMove).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    }
  } finally {
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'opens above the folder and closes with reduced motion = %s',
  async (reducedMotion) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reducedMotion })),
    );
    const files = ['Lecture.bin', 'Reading.bin'].map((name) => ({
      name,
      path: `Biology/${name}`,
      folder: false,
      size: 20,
      modified: 0,
    }));
    const roots = [folder];
    function Harness() {
      const [path, setPath] = useState('');
      return (
        <DocumentCanvas
          entries={path ? files : roots}
          allEntries={path ? files : roots}
          background={roots}
          path={path}
          selected={null}
          disabled={false}
          loading={false}
          canEdit={false}
          query=""
          onSelect={vi.fn()}
          onOpen={(entry) => setPath(entry.path)}
          onMove={vi.fn()}
          onImport={vi.fn()}
          onBack={() => setPath('')}
          onCreate={vi.fn()}
          options={null}
        />
      );
    }
    render(<Harness />);
    await act(async () => Promise.resolve());
    const closed = screen.getByRole('button', { name: 'Select Biology' });
    const origin = { x: parseFloat(closed.style.left), y: parseFloat(closed.style.top) };
    fireEvent.click(closed);
    const opened = screen.getByRole('button', { name: 'Close Biology folder' });
    expect(parseFloat(opened.style.left)).toBeCloseTo(origin.x * 0.85);
    expect(parseFloat(opened.style.top)).toBeCloseTo(origin.y * 0.85);
    for (const file of files) {
      const card = screen.getByRole('button', { name: `Select ${file.name}` });
      expect(parseFloat(card.style.top) + parseFloat(card.style.height)).toBeLessThan(origin.y);
    }
    vi.useFakeTimers();
    try {
      fireEvent.click(opened);
      expect(opened).toBeDisabled();
      if (!reducedMotion) {
        act(() => {
          vi.advanceTimersByTime(FOLDER_CLOSE_MS - 1);
        });
        expect(screen.getByRole('button', { name: 'Select Lecture.bin' })).toBeInTheDocument();
      }
      act(() => {
        vi.advanceTimersByTime(reducedMotion ? 0 : 1);
      });
      expect(screen.queryByRole('button', { name: 'Select Lecture.bin' })).not.toBeInTheDocument();
      const returned = screen.getByRole('button', { name: 'Select Biology' });
      expect(parseFloat(returned.style.left)).toBe(origin.x);
      expect(parseFloat(returned.style.top)).toBe(origin.y);
    } finally {
      vi.useRealTimers();
    }
  },
);

it('defers preview work until the flight ends and keeps slots fixed when image dimensions arrive', async () => {
  vi.useFakeTimers();
  const files = [
    { name: 'Diagram.png', path: 'Biology/Diagram.png', folder: false, size: 100, modified: 1 },
  ];
  const preview = vi
    .spyOn(previewCache, 'loadPreview')
    .mockResolvedValue({ mime: 'image/png', base64: 'test' });
  try {
    render(
      <DocumentCanvas
        entries={files}
        allEntries={files}
        background={[folder]}
        path="Biology"
        selected={null}
        disabled={false}
        loading={false}
        canEdit
        query=""
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onMove={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
        onCreate={vi.fn()}
        options={null}
      />,
    );
    const card = screen.getByRole('button', { name: 'Select Diagram.png' });
    const slot = card.getAttribute('style');
    expect(preview).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOLDER_SETTLE_MS - 1);
    });
    expect(preview).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(preview).toHaveBeenCalledOnce();
    const image = screen.getByAltText('Diagram.png first page');
    Object.defineProperties(image, {
      naturalWidth: { value: 1600 },
      naturalHeight: { value: 900 },
    });
    fireEvent.load(image);
    expect(card.getAttribute('style')).toBe(slot);
  } finally {
    vi.useRealTimers();
  }
});
