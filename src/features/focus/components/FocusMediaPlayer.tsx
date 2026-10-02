import { useEffect, useRef, useState, type RefObject } from 'react';
import { Music2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { useFocusMedia } from '@/features/focus/components/FocusMediaContext';

interface FocusMediaPlayerProps {
  visible: boolean;
}

function rewind(media: HTMLMediaElement) {
  try {
    media.currentTime = 0;
  } catch {
    // Some webviews do not allow seeking before metadata is available.
  }
}

function useTimerSyncedMedia<T extends HTMLMediaElement>(
  elementRef: RefObject<T | null>,
  selectedId: string | null,
) {
  const previousRef = useRef({
    selectedId: null as string | null,
    sessionId: null as string | null,
  });
  const playAttemptRef = useRef(0);
  const status = useFocusStore((state) => state.status);
  const phase = useFocusStore((state) => state.phase);
  const sessionId = useFocusStore((state) => state.sessionId);
  const [blockedId, setBlockedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const blocked = status === 'running' && phase === 'work' && blockedId === selectedId;
  const failed = errorId === selectedId;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const previous = previousRef.current;
    const mediaChanged = previous.selectedId !== selectedId;
    const newSession = sessionId !== null && previous.sessionId !== sessionId;

    if (!selectedId) {
      playAttemptRef.current += 1;
      element.pause();
      rewind(element);
    } else if (phase === 'work' && status === 'running') {
      if (mediaChanged || newSession) rewind(element);
      const attempt = ++playAttemptRef.current;
      void element.play().then(
        () => {
          if (playAttemptRef.current === attempt) setBlockedId(null);
        },
        () => {
          if (playAttemptRef.current === attempt) setBlockedId(selectedId);
        },
      );
    } else {
      playAttemptRef.current += 1;
      element.pause();
      if (mediaChanged || status === 'idle' || phase === 'break') rewind(element);
    }

    previousRef.current = { selectedId, sessionId };
  }, [elementRef, phase, selectedId, sessionId, status]);

  const retry = () => {
    const element = elementRef.current;
    if (!selectedId || !element) return;
    setErrorId(null);
    const attempt = ++playAttemptRef.current;
    void element.play().then(
      () => {
        if (playAttemptRef.current === attempt) setBlockedId(null);
      },
      () => {
        if (playAttemptRef.current === attempt) setBlockedId(selectedId);
      },
    );
  };

  const onLoadedData = (media: HTMLMediaElement) => {
    setErrorId(null);
    if (phase !== 'work' || status !== 'running') rewind(media);
  };

  const onError = () => {
    elementRef.current?.pause();
    setErrorId(selectedId);
    setBlockedId(null);
  };

  return { blocked, failed, retry, onLoadedData, onError };
}

export function FocusMediaPlayer({ visible }: FocusMediaPlayerProps) {
  const { videos, music } = useFocusMedia();
  const backgroundId = useFocusStore((state) => state.backgroundId);
  const musicId = useFocusStore((state) => state.musicId);
  const setMusicId = useFocusStore((state) => state.setMusicId);
  const customVideo = videos.find((video) => video.id === backgroundId);
  const selectedVideo = customVideo
    ? {
        id: customVideo.id,
        src: customVideo.url,
        hasAudio: customVideo.hasAudio ?? true,
      }
    : null;
  const selectedMusic = music.find((track) => track.id === musicId) ?? null;
  const playableMusic = selectedVideo?.hasAudio ? null : selectedMusic;
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const videoPlayback = useTimerSyncedMedia(videoRef, selectedVideo?.id ?? null);
  const musicPlayback = useTimerSyncedMedia(musicRef, playableMusic?.id ?? null);

  useEffect(() => {
    if (selectedVideo?.hasAudio && musicId) setMusicId(null);
  }, [musicId, selectedVideo?.hasAudio, setMusicId]);

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
          ref={videoRef}
          src={selectedVideo?.src}
          muted={Boolean(playableMusic)}
          loop
          playsInline
          preload="auto"
          onLoadedData={(event) => videoPlayback.onLoadedData(event.currentTarget)}
          onError={videoPlayback.onError}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            videoPlayback.failed ? 'opacity-0' : 'opacity-100',
          )}
        />
      </div>

      <audio
        ref={musicRef}
        src={playableMusic?.url}
        loop
        preload="auto"
        onLoadedData={(event) => musicPlayback.onLoadedData(event.currentTarget)}
        onError={musicPlayback.onError}
      />

      {visible && selectedVideo && videoPlayback.blocked && !videoPlayback.failed && (
        <button
          type="button"
          onClick={videoPlayback.retry}
          className="absolute bottom-8 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/90 px-4 py-2 text-xs font-medium text-primary shadow-raised backdrop-blur"
        >
          <Volume2 size={15} aria-hidden /> Video fortsetzen
        </button>
      )}
      {visible && playableMusic && musicPlayback.blocked && !musicPlayback.failed && (
        <button
          type="button"
          onClick={musicPlayback.retry}
          className="absolute bottom-20 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/90 px-4 py-2 text-xs font-medium text-primary shadow-raised backdrop-blur"
        >
          <Music2 size={15} aria-hidden /> Musik fortsetzen
        </button>
      )}
    </>
  );
}
