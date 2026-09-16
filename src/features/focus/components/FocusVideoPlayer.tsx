import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { findFocusVideo } from '@/features/focus/lib/videos';

interface FocusVideoPlayerProps {
  visible: boolean;
}

function rewind(video: HTMLVideoElement) {
  try {
    video.currentTime = 0;
  } catch {
    // Some webviews do not allow seeking before metadata is available.
  }
}

/**
 * Lives outside the route outlet so playback and original audio survive navigation.
 */
export function FocusVideoPlayer({ visible }: FocusVideoPlayerProps) {
  const elementRef = useRef<HTMLVideoElement>(null);
  const previousRef = useRef({ videoId: null as string | null, sessionId: null as string | null });
  const playAttemptRef = useRef(0);
  const backgroundId = useFocusStore((state) => state.backgroundId);
  const status = useFocusStore((state) => state.status);
  const phase = useFocusStore((state) => state.phase);
  const sessionId = useFocusStore((state) => state.sessionId);
  const selectedVideo = findFocusVideo(backgroundId);
  const [blockedVideoId, setBlockedVideoId] = useState<string | null>(null);
  const [errorVideoId, setErrorVideoId] = useState<string | null>(null);
  const playBlocked =
    status === 'running' && phase === 'work' && blockedVideoId === selectedVideo?.id;
  const mediaError = errorVideoId === selectedVideo?.id;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const previous = previousRef.current;
    const videoChanged = previous.videoId !== (selectedVideo?.id ?? null);
    const newSession = sessionId !== null && previous.sessionId !== sessionId;

    if (!selectedVideo) {
      playAttemptRef.current += 1;
      element.pause();
      rewind(element);
    } else if (phase === 'work' && status === 'running') {
      if (videoChanged || newSession) rewind(element);
      const attempt = ++playAttemptRef.current;
      void element.play().then(
        () => {
          if (playAttemptRef.current === attempt) setBlockedVideoId(null);
        },
        () => {
          if (playAttemptRef.current === attempt) setBlockedVideoId(selectedVideo.id);
        },
      );
    } else {
      playAttemptRef.current += 1;
      element.pause();
      if (videoChanged || status === 'idle' || phase === 'break') rewind(element);
    }

    previousRef.current = {
      videoId: selectedVideo?.id ?? null,
      sessionId,
    };
  }, [phase, selectedVideo, sessionId, status]);

  const retry = () => {
    const element = elementRef.current;
    if (!selectedVideo || !element) return;
    setErrorVideoId(null);
    const attempt = ++playAttemptRef.current;
    void element.play().then(
      () => {
        if (playAttemptRef.current === attempt) setBlockedVideoId(null);
      },
      () => {
        if (playAttemptRef.current === attempt) setBlockedVideoId(selectedVideo.id);
      },
    );
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'focus-video-backdrop pointer-events-none absolute inset-x-3.5 top-3.5 bottom-3.5 z-0 overflow-hidden rounded-2xl sm:inset-x-5 xl:inset-x-6',
          visible && selectedVideo ? 'opacity-100' : 'invisible opacity-0',
        )}
      >
        <video
          ref={elementRef}
          src={selectedVideo?.src}
          loop
          playsInline
          preload="auto"
          onLoadedData={(event) => {
            setErrorVideoId(null);
            if (phase !== 'work' || status !== 'running') rewind(event.currentTarget);
          }}
          onError={() => {
            elementRef.current?.pause();
            setErrorVideoId(selectedVideo?.id ?? null);
            setBlockedVideoId(null);
          }}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            mediaError ? 'opacity-0' : 'opacity-100',
          )}
        />
      </div>
      {visible && selectedVideo && playBlocked && !mediaError && (
        <button
          type="button"
          onClick={retry}
          className="absolute bottom-8 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/90 px-4 py-2 text-xs font-medium text-primary shadow-raised backdrop-blur"
        >
          <Volume2 size={15} aria-hidden /> Video fortsetzen
        </button>
      )}
    </>
  );
}
