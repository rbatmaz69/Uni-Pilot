import { useEffect, useState } from 'react';
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
import { prepareFocusSound } from '@/features/focus/lib/sound';
import { FocusProgressRing } from '@/features/focus/components/FocusProgressRing';
import { FocusDurationPanel } from '@/features/focus/components/FocusDurationPanel';
import { FocusStatisticsPanel } from '@/features/focus/components/FocusStatisticsPanel';
import {
  FocusBackgroundPanel,
  type BackgroundOption,
} from '@/features/focus/components/FocusBackgroundPanel';
import { listFocusBackgrounds } from '@/features/focus/lib/backgrounds';

export function FocusWorkspace() {
  const state = useFocusStore();
  const [controlsFading, setControlsFading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);
  const [backgroundRevision, setBackgroundRevision] = useState(0);
  const [backgrounds, setBackgrounds] = useState<BackgroundOption[]>([]);
  const [backgroundsLoading, setBackgroundsLoading] = useState(true);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (state.status !== 'running' || statisticsOpen || backgroundsOpen || settingsOpen) return;

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
  }, [state.status, state.phase, statisticsOpen, backgroundsOpen, settingsOpen]);
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
        current.pause();
      } else if (current.status === 'paused') {
        if (event.target instanceof Element && event.target.closest('button')) return;
        event.preventDefault();
        if (current.soundEnabled && current.phase === 'work') prepareFocusSound();
        current.start();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    listFocusBackgrounds()
      .then((items) => {
        if (!alive) return;
        const next = items
          .sort((a, b) => b.addedAt - a.addedAt)
          .map((item) => {
            const url = URL.createObjectURL(item.image);
            urls.push(url);
            return { ...item, url };
          });
        setBackgrounds(next);
        setBackgroundError(null);
      })
      .catch(() => {
        if (alive) setBackgroundError('Could not load images stored on this device.');
      })
      .finally(() => {
        if (alive) setBackgroundsLoading(false);
      });
    return () => {
      alive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [backgroundRevision]);

  const active = state.status === 'running' || state.status === 'paused';
  const remaining =
    state.status === 'running' && state.deadline !== null
      ? Math.min(state.remainingMs, Math.max(0, state.deadline - now))
      : state.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const dayKey = localDateKey(new Date(now));
  const backgroundUrl = backgrounds.find((item) => item.id === state.backgroundId)?.url;

  const start = () => {
    if (state.soundEnabled && state.phase === 'work') prepareFocusSound();
    setNow(Date.now());
    state.start();
  };

  return (
    <section
      aria-label="Focus timer"
      className={cn(
        'focus-scene relative isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl',
        state.status === 'running' &&
          !statisticsOpen &&
          !backgroundsOpen &&
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
          else if (statisticsOpen) setStatisticsOpen(false);
          else if (backgroundsOpen) setBackgroundsOpen(false);
          else if (state.focusMode) state.setFocusMode(false);
        }
      }}
    >
      <h1 className="sr-only">{NAV_ITEMS.focus.label}</h1>
      <p className="sr-only">{NAV_ITEMS.focus.subtitle}</p>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-3 text-center">
          <div className="focus-clock relative grid aspect-square w-full shrink-0 place-items-center">
            <FocusProgressRing
              status={state.status}
              deadline={state.deadline}
              remainingMs={state.remainingMs}
              durationMs={
                (state.phase === 'break' ? state.breakMinutes : state.durationMinutes) * 60_000
              }
            />
            <div className="flex w-full min-w-0 flex-col items-center px-7">
              <div
                role="timer"
                aria-label="Time remaining"
                aria-live="off"
                className="text-[clamp(3.5rem,7vw,5.5rem)] leading-tight font-normal tracking-[-0.065em] tabular-nums"
              >
                {time}
              </div>
              <div className="focus-control mt-6 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Reset timer"
                  title="Reset timer"
                  onClick={state.reset}
                  className="focus-transport-side grid h-10 w-10 place-items-center rounded-full"
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
                  className="focus-transport-main grid h-11 w-11 place-items-center rounded-full"
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
                  title={active ? 'Adjust times after this timer' : 'Set Pomodoro times'}
                  disabled={active}
                  onClick={() => setSettingsOpen(true)}
                  className="focus-transport-side grid h-10 w-10 place-items-center rounded-full disabled:opacity-50"
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
        className="absolute bottom-5 right-5 z-10 flex flex-col items-center gap-2"
      >
        <button
          type="button"
          aria-label="Show statistics"
          title="Statistics"
          aria-expanded={statisticsOpen}
          aria-controls={statisticsOpen ? 'focus-statistics' : undefined}
          className="focus-scene-button focus-control grid h-9 w-9 place-items-center rounded-full"
          onClick={() => {
            setSettingsOpen(false);
            setBackgroundsOpen(false);
            setStatisticsOpen(!statisticsOpen);
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
          className="focus-scene-button focus-control grid h-9 w-9 place-items-center rounded-full"
          onClick={() => {
            setSettingsOpen(false);
            setStatisticsOpen(false);
            setBackgroundsOpen(!backgroundsOpen);
          }}
        >
          <Images size={17} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={state.soundEnabled ? 'Mute completion sound' : 'Enable completion sound'}
          aria-pressed={state.soundEnabled}
          className="focus-scene-button focus-control grid h-9 w-9 place-items-center rounded-full"
          onClick={() => {
            if (!state.soundEnabled) prepareFocusSound();
            state.setSoundEnabled(!state.soundEnabled);
          }}
        >
          {state.soundEnabled ? (
            <Volume2 size={17} aria-hidden />
          ) : (
            <VolumeX size={17} aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label={state.focusMode ? 'Show toolbar' : 'Cover toolbar'}
          title={state.focusMode ? 'Show toolbar' : 'Cover toolbar'}
          className="focus-scene-button focus-control grid h-9 w-9 place-items-center rounded-full"
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
          workMinutes={state.durationMinutes}
          breakMinutes={state.breakMinutes}
          onSave={(workMinutes, breakMinutes) => {
            state.configureTimes(workMinutes, breakMinutes);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {statisticsOpen && (
        <FocusStatisticsPanel
          sessions={state.sessions}
          dayKey={dayKey}
          onClose={() => setStatisticsOpen(false)}
        />
      )}
      {backgroundsOpen && (
        <FocusBackgroundPanel
          selectedId={state.backgroundId}
          images={backgrounds}
          onSelect={(id) => state.setBackgroundId(id)}
          onRefresh={() => {
            setBackgroundsLoading(true);
            setBackgroundRevision((value) => value + 1);
          }}
          onClose={() => setBackgroundsOpen(false)}
          loading={backgroundsLoading}
          error={backgroundError}
        />
      )}
    </section>
  );
}
