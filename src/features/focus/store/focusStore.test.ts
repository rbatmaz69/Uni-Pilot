import { beforeEach, describe, expect, it } from 'vitest';
import { useFocusStore } from '@/features/focus/store/focusStore';

const focus = () => useFocusStore.getState();

beforeEach(() => useFocusStore.setState(useFocusStore.getInitialState(), true));

describe('focus timer', () => {
  it('defaults to 25 minutes of work and 5 minutes of break', () => {
    expect(focus()).toMatchObject({ durationMinutes: 25, breakMinutes: 5, phase: 'work' });
  });

  it('starts the break automatically and returns to work after it ends', () => {
    focus().configureTimes(1, 2);
    focus().start(1000);
    expect(focus().checkDeadline(61_000)).toMatchObject({
      focusedMs: 60_000,
      outcome: 'completed',
    });
    expect(focus()).toMatchObject({
      phase: 'break',
      status: 'running',
      remainingMs: 120_000,
      deadline: 181_000,
    });
    expect(focus().checkDeadline(181_000)).toBeNull();
    expect(focus()).toMatchObject({
      phase: 'work',
      status: 'idle',
      remainingMs: 60_000,
      sessions: [expect.objectContaining({ focusedMs: 60_000 })],
    });
  });

  it('supports a custom duration and excludes paused time from the saved session', () => {
    focus().configure(45, '  Chapter 4  ');
    focus().start(1000);
    focus().pause(31_000);
    expect(focus().remainingMs).toBe(45 * 60_000 - 30_000);
    focus().start(600_000);
    expect(focus().deadline).toBe(600_000 + 45 * 60_000 - 30_000);
    focus().checkDeadline(focus().deadline!);
    expect(focus().sessions).toHaveLength(1);
    expect(focus().sessions[0]).toMatchObject({
      goal: 'Chapter 4',
      focusedMs: 45 * 60_000,
      outcome: 'completed',
    });
  });

  it('reconciles delayed background ticks at the original deadline, exactly once', () => {
    focus().configure(1, '');
    focus().start(1000);
    expect(focus().checkDeadline(60_999)).toBeNull();
    expect(focus().checkDeadline(500_000)).toMatchObject({ finishedAt: 61_000, focusedMs: 60_000 });
    expect(focus().checkDeadline(600_000)).toBeNull();
    expect(focus().finish(600_000)).toBeNull();
    expect(focus().sessions).toHaveLength(1);
    expect(focus()).toMatchObject({ phase: 'work', status: 'idle' });
  });

  it('restores a running timer and its goal from local storage after a reload', async () => {
    focus().configure(90, 'Project');
    focus().start(1000);
    const persisted = localStorage.getItem('uni-pilot.focus')!;
    useFocusStore.setState(useFocusStore.getInitialState(), true);
    localStorage.setItem('uni-pilot.focus', persisted);
    await useFocusStore.persist.rehydrate();
    expect(focus()).toMatchObject({ status: 'running', goal: 'Project', deadline: 5_401_000 });
    focus().checkDeadline(6_000_000);
    expect(focus().sessions[0]?.focusedMs).toBe(90 * 60_000);
  });

  it('restores a paused timer without counting time away', async () => {
    focus().configure(1, '');
    focus().start(1000);
    focus().pause(21_000);
    await useFocusStore.persist.rehydrate();
    expect(focus().checkDeadline(100_000)).toBeNull();
    expect(focus().remainingMs).toBe(40_000);
    focus().start(100_000);
    expect(focus().deadline).toBe(140_000);
  });

  it('saves only actual work when ending early, including while paused', () => {
    focus().start(1000);
    focus().pause(31_000);
    focus().finish(600_000);
    expect(focus().sessions[0]).toMatchObject({ focusedMs: 30_000, outcome: 'ended' });
    expect(focus().focusMode).toBe(false);
  });

  it('resets without recording a completion and starts a fresh session', () => {
    focus().configure(60, 'Thesis');
    focus().start(1000);
    focus().pause(21_000);
    focus().reset();
    expect(focus()).toMatchObject({
      status: 'idle',
      remainingMs: 3_600_000,
      sessions: [],
      segments: [],
      goal: 'Thesis',
    });
    focus().start(50_000);
    focus().finish(60_000);
    expect(focus().sessions[0]?.focusedMs).toBe(10_000);
  });

  it.each([0, -1, 241, 1.5, NaN, Infinity])('rejects invalid duration %s', (minutes) => {
    focus().configure(minutes, 'Invalid');
    expect(focus().durationMinutes).toBe(25);
  });

  it('does not let settings or duplicate starts replace an active session', () => {
    focus().start(1000);
    const id = focus().sessionId;
    focus().start(5000);
    focus().configure(90, 'Changed');
    expect(focus()).toMatchObject({ sessionId: id, durationMinutes: 25, deadline: 1_501_000 });
    focus().pause(2000);
    focus().configure(90, 'Changed');
    expect(focus().durationMinutes).toBe(25);
  });

  it('completes instead of pausing an already expired session', () => {
    focus().configure(1, '');
    focus().start(1000);
    focus().pause(70_000);
    expect(focus()).toMatchObject({ status: 'running', phase: 'break' });
    expect(focus().sessions[0]?.focusedMs).toBe(60_000);
  });

  it('only covers the toolbar on request and reveals it on pause', () => {
    focus().start(1000);
    expect(focus().focusMode).toBe(false);
    focus().setFocusMode(true);
    focus().pause(2000);
    expect(focus()).toMatchObject({ status: 'paused', focusMode: false });
    focus().start(3000);
    expect(focus().focusMode).toBe(false);
  });
});
