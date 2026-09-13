import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusBreakCat } from '@/features/focus/components/FocusBreakCat';
import { BREAK_CAT_CLIPS, BREAK_CAT_LABEL } from '@/features/focus/lib/breakCats';

const cat = () => screen.queryByRole('img', { name: BREAK_CAT_LABEL });
const clip = () => cat()?.querySelector('video') ?? null;

const spyOnPlay = () => vi.spyOn(HTMLMediaElement.prototype, 'play');
const spyOnLoad = () => vi.spyOn(HTMLMediaElement.prototype, 'load');

let play: ReturnType<typeof spyOnPlay>;
let load: ReturnType<typeof spyOnLoad>;
let frames: FrameRequestCallback[];

const paint = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  });

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  play = spyOnPlay();
  load = spyOnLoad();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('break companion', () => {
  it('walks the cat in, then naps on a loop in the same element', () => {
    render(<FocusBreakCat />);
    paint();

    // A z-index on the wrapper would open a stacking context, blend the cat
    // against transparency and paint its black backdrop over the scene.
    expect(cat()?.className).not.toMatch(/(^|\s)z-/);
    const walking = clip();
    expect(walking).toHaveAttribute('src', BREAK_CAT_CLIPS.arrive);
    expect(walking).toHaveClass('focus-break-cat-arriving');
    expect(walking).not.toHaveAttribute('loop');
    // React sets `muted` as a property, never an attribute; the clips also ship
    // without an audio track, so a break cannot make a sound either way.
    expect(walking?.muted).toBe(true);

    fireEvent.ended(walking!);
    paint();

    const napping = clip();
    // Same element on purpose — a clip mounted after the first paint decodes frames
    // the webview never composites, and the break would run with no cat in it.
    expect(napping).toBe(walking);
    expect(napping).toHaveAttribute('src', BREAK_CAT_CLIPS.sleep);
    expect(napping).toHaveAttribute('loop');
    expect(napping).not.toHaveClass('focus-break-cat-arriving');
  });

  it('loads a swapped clip a frame later rather than in the same task', () => {
    render(<FocusBreakCat />);
    paint();
    load.mockClear();

    fireEvent.ended(clip()!);
    // Loading here — in the task that changed the source — is what leaves the webview
    // decoding frames it never paints.
    expect(load).not.toHaveBeenCalled();

    paint();

    expect(load).toHaveBeenCalledOnce();
  });

  it('picks playback up again when the window comes back', () => {
    render(<FocusBreakCat />);
    paint();
    const before = play.mock.calls.length;

    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));

    expect(play.mock.calls.length).toBe(before + 2);
  });

  it('falls back to the nap when the walk-in cannot play', () => {
    render(<FocusBreakCat />);
    paint();

    fireEvent.error(clip()!);

    expect(clip()).toHaveAttribute('src', BREAK_CAT_CLIPS.sleep);
  });

  it('leaves the scene untouched when neither clip can play', () => {
    render(<FocusBreakCat />);
    paint();

    fireEvent.error(clip()!);
    fireEvent.error(clip()!);

    expect(cat()).toBeNull();
  });

  it('holds a still cat and never starts playback when motion is reduced', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: true, media: query })),
    );

    render(<FocusBreakCat />);
    paint();

    expect(clip()).toHaveAttribute('src', BREAK_CAT_CLIPS.sleep);
    expect(clip()).not.toHaveAttribute('autoplay');
    expect(play).not.toHaveBeenCalled();
    // Still loaded, or the paused clip would have no frame to show.
    expect(load).toHaveBeenCalledOnce();
  });
});
