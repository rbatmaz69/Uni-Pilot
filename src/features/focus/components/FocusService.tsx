import { useEffect } from 'react';
import { useFocusStore } from '@/features/focus/store/focusStore';
import {
  FOCUS_COMPLETION_SOUND_DURATION_MS,
  playFocusCompletionSound,
  prepareFocusAudio,
  startFocusTicking,
  stopFocusTicking,
} from '@/features/focus/lib/sound';

const MEDIA_START_EVENTS = ['playing'] as const;
const MEDIA_STOP_EVENTS = [
  'pause',
  'ended',
  'error',
  'emptied',
  'abort',
  'waiting',
  'stalled',
] as const;

/** Lives outside the route. Deadlines survive navigation, throttling and reloads. */
export function FocusService() {
  useEffect(() => {
    const playingMedia = new Set<HTMLMediaElement>();
    const mutedMedia = new Set<HTMLMediaElement>();
    const previousMutedState = new WeakMap<HTMLMediaElement, boolean>();
    let completionSoundPlaying = false;
    let completionTimer: number | null = null;

    const rememberAndMute = (media: HTMLMediaElement) => {
      if (!mutedMedia.has(media)) {
        previousMutedState.set(media, media.muted);
        mutedMedia.add(media);
      }
      media.muted = true;
    };

    const restoreMediaSound = () => {
      mutedMedia.forEach((media) => {
        media.muted = previousMutedState.get(media) ?? media.muted;
      });
      mutedMedia.clear();
    };

    const mediaElements = () =>
      Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'));

    const applyAmbientAudioPreference = () => {
      if (useFocusStore.getState().ambientAudioEnabled) restoreMediaSound();
      else mediaElements().forEach(rememberAndMute);
    };

    const isAudibleMediaPlaying = () => {
      let audible = false;
      playingMedia.forEach((media) => {
        if (!media.isConnected) playingMedia.delete(media);
        else if (!media.muted && media.volume > 0) audible = true;
      });
      return audible;
    };

    const reconcileTicking = () => {
      const state = useFocusStore.getState();
      if (
        state.status === 'running' &&
        state.ambientAudioEnabled &&
        !completionSoundPlaying &&
        !isAudibleMediaPlaying()
      ) {
        startFocusTicking();
      } else {
        stopFocusTicking();
      }
    };

    const signalCompletion = () => {
      if (completionSoundPlaying) return;
      completionSoundPlaying = true;
      stopFocusTicking();
      playFocusCompletionSound();
      completionTimer = window.setTimeout(() => {
        completionTimer = null;
        completionSoundPlaying = false;
        reconcileTicking();
      }, FOCUS_COMPLETION_SOUND_DURATION_MS);
    };

    const handleMediaEvent = (event: Event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      const media = event.target;
      if (!useFocusStore.getState().ambientAudioEnabled && !media.muted) rememberAndMute(media);
      if (event.type === 'playing') playingMedia.add(media);
      else if (MEDIA_STOP_EVENTS.includes(event.type as (typeof MEDIA_STOP_EVENTS)[number])) {
        playingMedia.delete(media);
      }
      reconcileTicking();
    };

    MEDIA_START_EVENTS.forEach((eventName) =>
      document.addEventListener(eventName, handleMediaEvent, true),
    );
    MEDIA_STOP_EVENTS.forEach((eventName) =>
      document.addEventListener(eventName, handleMediaEvent, true),
    );
    document.addEventListener('volumechange', handleMediaEvent, true);

    const observeMedia = new MutationObserver((records) => {
      if (useFocusStore.getState().ambientAudioEnabled) return;
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLMediaElement) rememberAndMute(node);
          if (node instanceof Element) {
            node.querySelectorAll<HTMLMediaElement>('audio, video').forEach(rememberAndMute);
          }
        }),
      );
      reconcileTicking();
    });
    observeMedia.observe(document.body, { childList: true, subtree: true });

    mediaElements().forEach((media) => {
      if (!media.paused && !media.ended) playingMedia.add(media);
    });
    applyAmbientAudioPreference();

    const unsubscribe = useFocusStore.subscribe((state, previous) => {
      if (state.ambientAudioEnabled !== previous.ambientAudioEnabled) {
        applyAmbientAudioPreference();
      }
      if (
        previous.status === 'running' &&
        previous.deadline !== null &&
        Date.now() >= previous.deadline &&
        state.phase !== previous.phase
      ) {
        signalCompletion();
      }
      reconcileTicking();
    });

    const check = () => {
      for (let transitions = 0; transitions < 2; transitions += 1) {
        if (!useFocusStore.getState().checkDeadline()) break;
      }
      reconcileTicking();
    };
    const unlockRestoredTimerAudio = () => {
      if (useFocusStore.getState().status === 'running') prepareFocusAudio();
    };
    check();
    const timer = window.setInterval(check, 500);
    window.addEventListener('focus', check);
    window.addEventListener('pointerdown', unlockRestoredTimerAudio, true);
    window.addEventListener('keydown', unlockRestoredTimerAudio, true);
    document.addEventListener('visibilitychange', check);
    return () => {
      unsubscribe();
      observeMedia.disconnect();
      MEDIA_START_EVENTS.forEach((eventName) =>
        document.removeEventListener(eventName, handleMediaEvent, true),
      );
      MEDIA_STOP_EVENTS.forEach((eventName) =>
        document.removeEventListener(eventName, handleMediaEvent, true),
      );
      document.removeEventListener('volumechange', handleMediaEvent, true);
      window.clearInterval(timer);
      if (completionTimer !== null) window.clearTimeout(completionTimer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pointerdown', unlockRestoredTimerAudio, true);
      window.removeEventListener('keydown', unlockRestoredTimerAudio, true);
      document.removeEventListener('visibilitychange', check);
      stopFocusTicking();
      restoreMediaSound();
    };
  }, []);

  return null;
}
