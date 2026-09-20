import { useEffect, useRef, useState } from 'react';
import {
  ChartColumn,
  Images,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { localDateKey } from '@/lib/date';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { prepareFocusAudio } from '@/features/focus/lib/sound';
import { FocusProgressRing } from '@/features/focus/components/FocusProgressRing';
import { FocusDurationPanel } from '@/features/focus/components/FocusDurationPanel';
import { FocusStatisticsPanel } from '@/features/focus/components/FocusStatisticsPanel';
import { FocusBackgroundPanel } from '@/features/focus/components/FocusBackgroundPanel';
import { useFocusMedia } from '@/features/focus/components/FocusMediaContext';

type OpenSidePanel = 'statistics' | 'backgrounds' | null;

export function FocusWorkspace() {
  const state = useFocusStore();
  const { images, videos } = useFocusMedia();
  const sceneRef = useRef<HTMLElement>(null);
  const handledSpaceRef = useRef(false);
  const [controlsFading, setControlsFading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openSidePanel, setOpenSidePanel] = useState<OpenSidePanel>(null);
  const [now, setNow] = useState(Date.now);
  const statisticsOpen = openSidePanel === 'statistics';
  const backgroundsOpen = openSidePanel === 'backgrounds';
  const sidePanelOpen = openSidePanel !== null;

  useEffect(() => {
    if (state.status !== 'running' || sidePanelOpen || settingsOpen) return;

    let fadeTimer: number;
    const reveal = () => {
      setControlsFading(false);
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => setControlsFading(true), 120);
    };
    reveal();
    window.addEventListener('pointermove', reveal);
    window.addEventListener('pointerdown', reveal);
    window.addEventListener('keydown', reveal);
    window.addEventListener('touchstart', reveal);
    window.addEventListener('wheel', reveal);
    return () => {
      window.clearTimeout(fadeTimer);
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('keydown', reveal);
      window.removeEventListener('touchstart', reveal);
      window.removeEventListener('wheel', reveal);
    };
  }, [state.status, state.phase, sidePanelOpen, settingsOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.code !== 'Space' && event.key !== ' ') ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, select, textarea, [contenteditable="true"], [role="dialog"]')
      )
        return;
      const current = useFocusStore.getState();
      if (current.status === 'running') {
        event.preventDefault();
        event.stopPropagation();
        handledSpaceRef.current = true;
        current.pause();
      } else if (current.status === 'paused') {
        event.preventDefault();
        event.stopPropagation();
        handledSpaceRef.current = true;
        prepareFocusAudio();
        current.start();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== ' ') || !handledSpaceRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      handledSpaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      handledSpaceRef.current = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, state.status === 'running' ? 250 : 60_000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [state.status]);
  const active = state.status === 'running' || state.status === 'paused';
  const remaining =
    state.status === 'running' && state.deadline !== null
      ? Math.min(state.remainingMs, Math.max(0, state.deadline - now))
      : state.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const dayKey = localDateKey(new Date(now));
  const backgroundUrl = images.find((item) => item.id === state.backgroundId)?.url;
  const backgroundVideo = videos.find((item) => item.id === state.backgroundId);

  const start = () => {
    prepareFocusAudio();
    setNow(Date.now());
    state.start();
  };

  return (
    <section
      ref={sceneRef}
      aria-label="Focus timer"
      className={cn(
        'focus-scene relative isolate flex min-h-0 flex-1 flex-col overflow-clip rounded-2xl',
        backgroundVideo && 'focus-scene-video',
        state.status === 'running' &&
          !sidePanelOpen &&
          !settingsOpen &&
          controlsFading &&
          'focus-controls-fading',
      )}
      style={
        backgroundUrl
          ? {
              backgroundImage: `linear-gradient(var(--focus-image-shade), var(--focus-image-shade)), url("${backgroundUrl}")`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (settingsOpen) setSettingsOpen(false);
          else if (sidePanelOpen) setOpenSidePanel(null);
          else if (state.focusMode) state.setFocusMode(false);
        }
      }}
    >
      <h1 className="sr-only">{NAV_ITEMS.focus.label}</h1>
      <p className="sr-only">{NAV_ITEMS.focus.subtitle}</p>
      <div
        className={cn(
          'focus-stage relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto',
          sidePanelOpen && 'focus-stage-obscured',
          settingsOpen && 'focus-stage-settings-obscured',
        )}
      >
        <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-3 text-center">
          <div className="focus-clock relative grid aspect-square w-full shrink-0 place-items-center">
            <FocusProgressRing
              status={state.status}
              deadline={state.deadline}
              remainingMs={state.remainingMs}
              durationMs={
                active && state.segmentDurationMs !== null
                  ? state.segmentDurationMs
                  : (state.phase === 'break' ? state.breakMinutes : state.durationMinutes) * 60_000
              }
            />
            <div className="flex w-full min-w-0 flex-col items-center px-7">
              <div
                role="timer"
                aria-label="Time remaining"
                aria-live="off"
                className="text-[64px] leading-tight font-light tracking-[-0.04em] tabular-nums"
              >
                {time}
              </div>
              <div className="focus-control mt-5 flex items-center gap-5">
                <button
                  type="button"
                  aria-label="Reset timer"
                  title="Reset timer"
                  onClick={state.reset}
                  className="focus-transport-button focus-transport-side grid h-10 w-10 place-items-center rounded-full"
                >
                  <RotateCcw size={17} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={
                    state.status === 'running'
                      ? 'Pause'
                      : state.status === 'paused'
                        ? 'Resume'
                        : state.phase === 'break'
                          ? 'Start break'
                          : 'Start focus'
                  }
                  title={state.status === 'running' ? 'Pause' : 'Start'}
                  onClick={state.status === 'running' ? () => state.pause() : start}
                  className="focus-transport-button focus-transport-main grid h-11 w-11 place-items-center rounded-full"
                >
                  {state.status === 'running' ? (
                    <Pause size={18} aria-hidden />
                  ) : (
                    <Play size={18} fill="currentColor" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Set Pomodoro times"
                  title={active ? 'Set times for the next timer' : 'Set Pomodoro times'}
                  onClick={() => {
                    setOpenSidePanel(null);
                    setSettingsOpen(true);
                  }}
                  className="focus-transport-button focus-transport-side grid h-10 w-10 place-items-center rounded-full"
                >
                  <Settings2 size={18} aria-hidden />
                </button>
              </div>
              <p className="focus-control mt-3 text-[11px] font-medium tracking-wide">
                <span className={state.phase === 'work' ? 'opacity-100' : 'opacity-65'}>
                  Pomodoro {state.durationMinutes}:00
                </span>
                <span className="mx-2 opacity-60" aria-hidden>
                  ·
                </span>
                <span className={state.phase === 'break' ? 'opacity-100' : 'opacity-65'}>
                  Break {state.breakMinutes}:00
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="Focus tools"
        className="absolute bottom-5 right-5 z-30 flex flex-col items-center gap-2"
      >
        <button
          type="button"
          aria-label="Show statistics"
          title="Statistics"
          aria-expanded={statisticsOpen}
          aria-controls={statisticsOpen ? 'focus-statistics' : undefined}
          className={cn(
            'focus-scene-button focus-tool focus-control grid h-10 w-10 place-items-center rounded-full',
            statisticsOpen && 'focus-scene-button-active',
            sidePanelOpen && 'focus-tool-hidden',
          )}
          aria-hidden={sidePanelOpen}
          tabIndex={sidePanelOpen ? -1 : undefined}
          onClick={() => {
            setSettingsOpen(false);
            setOpenSidePanel((current) => (current === 'statistics' ? null : 'statistics'));
          }}
        >
          <ChartColumn size={17} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Choose background"
          title="Backgrounds"
          aria-expanded={backgroundsOpen}
          aria-controls={backgroundsOpen ? 'focus-backgrounds' : undefined}
          className={cn(
            'focus-scene-button focus-tool focus-control grid h-9 w-9 place-items-center rounded-full',
            backgroundsOpen && 'focus-scene-button-active',
            sidePanelOpen && 'focus-tool-hidden',
          )}
          aria-hidden={sidePanelOpen}
          tabIndex={sidePanelOpen ? -1 : undefined}
          onClick={() => {
            setSettingsOpen(false);
            setOpenSidePanel((current) => (current === 'backgrounds' ? null : 'backgrounds'));
          }}
        >
          <Images size={17} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={state.ambientAudioEnabled ? 'Mute focus audio' : 'Enable focus audio'}
          title={state.ambientAudioEnabled ? 'Mute focus audio' : 'Enable focus audio'}
          aria-pressed={state.ambientAudioEnabled}
          className={cn(
            'focus-scene-button focus-tool focus-control grid h-9 w-9 place-items-center rounded-full',
            sidePanelOpen && 'focus-tool-hidden',
          )}
          aria-hidden={sidePanelOpen}
          tabIndex={sidePanelOpen ? -1 : undefined}
          onClick={() => {
            if (!state.ambientAudioEnabled) prepareFocusAudio();
            state.setAmbientAudioEnabled(!state.ambientAudioEnabled);
          }}
        >
          {state.ambientAudioEnabled ? (
            <Volume2 size={17} aria-hidden />
          ) : (
            <VolumeX size={17} aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label={state.focusMode ? 'Show toolbar' : 'Cover toolbar'}
          title={state.focusMode ? 'Show toolbar' : 'Cover toolbar'}
          className={cn(
            'focus-scene-button focus-tool focus-control grid h-9 w-9 place-items-center rounded-full',
            sidePanelOpen && 'focus-tool-hidden',
          )}
          aria-hidden={sidePanelOpen}
          tabIndex={sidePanelOpen ? -1 : undefined}
          aria-pressed={state.focusMode}
          onClick={() => {
            setControlsFading(false);
            state.setFocusMode(!state.focusMode);
          }}
        >
          {state.focusMode ? (
            <Minimize2 size={15} aria-hidden />
          ) : (
            <Maximize2 size={15} aria-hidden />
          )}
        </button>
      </div>
      {state.status === 'running' && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[11px] tracking-wide opacity-75">
          Space · pause
        </p>
      )}
      {settingsOpen && (
        <FocusDurationPanel
          anchorRef={sceneRef}
          workMinutes={state.durationMinutes}
          breakMinutes={state.breakMinutes}
          appliesToNextSegment={active}
          onSave={(workMinutes, breakMinutes) => {
            state.configureTimes(workMinutes, breakMinutes);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <FocusStatisticsPanel
        open={statisticsOpen}
        sessions={state.sessions}
        dayKey={dayKey}
        onClose={() => setOpenSidePanel(null)}
      />
      <FocusBackgroundPanel open={backgroundsOpen} onClose={() => setOpenSidePanel(null)} />
    </section>
  );
}
