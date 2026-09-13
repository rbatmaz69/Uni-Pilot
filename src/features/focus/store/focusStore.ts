import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FocusSegment {
  start: number;
  end: number;
}

export interface FocusSession {
  id: string;
  goal: string;
  plannedMs: number;
  focusedMs: number;
  finishedAt: number;
  outcome: 'completed' | 'ended';
  segments: FocusSegment[];
}

interface FocusState {
  durationMinutes: number;
  breakMinutes: number;
  phase: 'work' | 'break';
  goal: string;
  status: 'idle' | 'running' | 'paused' | 'completed';
  remainingMs: number;
  deadline: number | null;
  segmentStart: number | null;
  segments: FocusSegment[];
  sessionId: string | null;
  focusMode: boolean;
  backgroundId: string | null;
  soundEnabled: boolean;
  sessions: FocusSession[];
  configure: (minutes: number, goal: string) => void;
  configureTimes: (workMinutes: number, breakMinutes: number) => void;
  start: (now?: number) => void;
  pause: (now?: number) => void;
  reset: () => void;
  finish: (now?: number) => FocusSession | null;
  checkDeadline: (now?: number) => FocusSession | null;
  setFocusMode: (enabled: boolean) => void;
  setBackgroundId: (id: string | null) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export function validMinutes(minutes: number) {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 240;
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      durationMinutes: 25,
      breakMinutes: 5,
      phase: 'work',
      goal: '',
      status: 'idle',
      remainingMs: 25 * 60_000,
      deadline: null,
      segmentStart: null,
      segments: [],
      sessionId: null,
      focusMode: false,
      backgroundId: null,
      soundEnabled: true,
      sessions: [],
      configure: (minutes, goal) => {
        if (!validMinutes(minutes) || ['running', 'paused'].includes(get().status)) return;
        set({
          durationMinutes: minutes,
          phase: 'work',
          goal: goal.trim().slice(0, 200),
          remainingMs: minutes * 60_000,
          status: 'idle',
        });
      },
      configureTimes: (workMinutes, breakMinutes) => {
        if (
          !validMinutes(workMinutes) ||
          !validMinutes(breakMinutes) ||
          ['running', 'paused'].includes(get().status)
        )
          return;
        set({
          durationMinutes: workMinutes,
          breakMinutes,
          phase: 'work',
          remainingMs: workMinutes * 60_000,
          status: 'idle',
        });
      },
      start: (now = Date.now()) => {
        const state = get();
        if (state.status === 'running') return;
        const resuming = state.status === 'paused';
        const remainingMs = resuming
          ? state.remainingMs
          : (state.phase === 'break' ? state.breakMinutes : state.durationMinutes) * 60_000;
        set({
          status: 'running',
          remainingMs,
          deadline: now + remainingMs,
          segmentStart: state.phase === 'work' ? now : null,
          sessionId:
            state.phase === 'work' ? (resuming ? state.sessionId : crypto.randomUUID()) : null,
          segments: state.phase === 'work' && resuming ? state.segments : [],
          focusMode: state.focusMode,
        });
      },
      pause: (now = Date.now()) => {
        if (get().checkDeadline(now)) return;
        const state = get();
        if (state.status !== 'running' || state.deadline === null) return;
        set({
          status: 'paused',
          focusMode: false,
          remainingMs: Math.min(state.remainingMs, Math.max(0, state.deadline - now)),
          deadline: null,
          segmentStart: null,
          segments:
            state.segmentStart === null
              ? state.segments
              : [
                  ...state.segments,
                  { start: state.segmentStart, end: Math.max(state.segmentStart, now) },
                ],
        });
      },
      reset: () =>
        set((state) => ({
          status: 'idle',
          remainingMs:
            (state.phase === 'break' ? state.breakMinutes : state.durationMinutes) * 60_000,
          deadline: null,
          segmentStart: null,
          sessionId: null,
          segments: [],
          focusMode: false,
        })),
      finish: (now = Date.now()) => {
        const state = get();
        if (state.phase === 'break') {
          if (!['running', 'paused'].includes(state.status)) return null;
          set({
            phase: 'work',
            status: 'idle',
            remainingMs: state.durationMinutes * 60_000,
            deadline: null,
            segmentStart: null,
            sessionId: null,
            segments: [],
            focusMode: false,
          });
          return null;
        }
        if (!state.sessionId || !['running', 'paused'].includes(state.status)) return null;
        const finishedAt = state.deadline === null ? now : Math.min(now, state.deadline);
        const segments =
          state.segmentStart === null
            ? state.segments
            : [
                ...state.segments,
                { start: state.segmentStart, end: Math.max(state.segmentStart, finishedAt) },
              ];
        const session: FocusSession = {
          id: state.sessionId,
          goal: state.goal,
          plannedMs: state.durationMinutes * 60_000,
          focusedMs: Math.min(
            state.durationMinutes * 60_000,
            segments.reduce((sum, segment) => sum + segment.end - segment.start, 0),
          ),
          finishedAt,
          outcome: state.deadline !== null && now >= state.deadline ? 'completed' : 'ended',
          segments,
        };
        set({
          phase: 'break',
          status: session.outcome === 'completed' ? 'running' : 'idle',
          remainingMs: state.breakMinutes * 60_000,
          deadline:
            session.outcome === 'completed' ? finishedAt + state.breakMinutes * 60_000 : null,
          segmentStart: null,
          sessionId: null,
          segments: [],
          focusMode: false,
          sessions: session.focusedMs > 0 ? [session, ...state.sessions] : state.sessions,
        });
        return session;
      },
      checkDeadline: (now = Date.now()) => {
        const { status, deadline, finish } = get();
        return status === 'running' && deadline !== null && now >= deadline ? finish(now) : null;
      },
      setFocusMode: (focusMode) => set({ focusMode }),
      setBackgroundId: (backgroundId) => set({ backgroundId }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    { name: 'uni-pilot.focus', version: 1 },
  ),
);
