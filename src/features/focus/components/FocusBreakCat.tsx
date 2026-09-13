import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BREAK_CAT_CLIPS,
  BREAK_CAT_LABEL,
  type BreakCatStage,
} from '@/features/focus/lib/breakCats';

/**
 * Takes over the scene for the whole break phase: the cat walks in once, then naps
 * on a loop until the break is over.
 *
 * Both clips are cut out on black, so `mix-blend-screen` drops that black away. Two
 * things have to hold for that to look right: no ancestor between here and the
 * isolated `.focus-scene` may open a stacking context, or the cat blends against
 * transparency and paints a black box; and the backdrop must be dark, or screen
 * blending washes the cat out — hence the shade painted under it.
 *
 * The two clips share one element and swap `src`, rather than being mounted side by
 * side. A `<video>` added to the scene after the first paint — as a second clip
 * mounted from the first one's `ended` event would be — decodes frames a webview
 * then never composites, leaving the break cat-less. An element that has been
 * painting since it mounted keeps painting straight through a source change, and the
 * clips meet in the same pose, so the swap does not show.
 */
export function FocusBreakCat() {
  const [reducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [stage, setStage] = useState<BreakCatStage>(reducedMotion ? 'sleep' : 'arrive');
  const [unavailable, setUnavailable] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  /**
   * Loads whichever clip the stage calls for, then keeps it running.
   *
   * The load is deferred by a frame on purpose. Loading in the same task as the
   * source change — which is what happens when the walk-in's `ended` event swaps the
   * stage — leaves the webview decoding frames it never composites, so the nap would
   * play to an empty scene. Re-playing on `focus` and `visibilitychange` covers the
   * other half: a webview may suspend media while its window is occluded, which would
   * otherwise leave the cat frozen mid-walk for the rest of the break.
   */
  useEffect(() => {
    const element = video.current;
    if (!element || unavailable) return;
    const frame = requestAnimationFrame(() => {
      element.load();
      if (!reducedMotion) void element.play().catch(() => {});
    });
    if (reducedMotion) return () => cancelAnimationFrame(frame);

    const resume = () => {
      if (element.paused && !element.ended) void element.play().catch(() => {});
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [reducedMotion, stage, unavailable]);

  if (unavailable) return null;

  return (
    <div
      role="img"
      aria-label={BREAK_CAT_LABEL}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="focus-break-cat-shade absolute inset-0" aria-hidden />
      <video
        ref={video}
        src={BREAK_CAT_CLIPS[stage]}
        autoPlay={!reducedMotion}
        muted
        loop={stage === 'sleep'}
        playsInline
        preload="auto"
        aria-hidden
        // Parked bottom right, clear of both the centred clock and the tool column.
        className={cn(
          'absolute bottom-0 right-16 h-[62%] w-[68%] object-contain object-right-bottom mix-blend-screen',
          stage === 'arrive' && 'focus-break-cat-arriving',
        )}
        onEnded={() => setStage('sleep')}
        onError={() => (stage === 'arrive' ? setStage('sleep') : setUnavailable(true))}
      />
    </div>
  );
}
