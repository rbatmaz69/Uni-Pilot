import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { CourseSync, KEEP_ALIVE_MS } from './CourseSync';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const courseReads = () => invoke.mock.calls.filter(([command]) => command === 'ilias_sync_courses');

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset().mockResolvedValue([]);
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useCourseStore.setState({ failure: null, loading: {} });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

describe('keeping the ILIAS sign-in alive', () => {
  it('reads the course list every quarter of an hour while the app runs', async () => {
    render(<CourseSync />);
    expect(courseReads()).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS));
    expect(courseReads()).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS));
    expect(courseReads()).toHaveLength(2);
  });

  /** A ping cannot bring a sign-in back; asking again would only knock on the door. */
  it('stops once ILIAS says the sign-in has ended', async () => {
    invoke.mockRejectedValue({ kind: 'signedOut' });
    render(<CourseSync />);

    await act(() => vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS));
    await act(() => vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 3));
    expect(courseReads()).toHaveLength(1);
  });

  it('does nothing without a connection', async () => {
    useIliasStore.setState({ connection: null });
    render(<CourseSync />);
    await act(() => vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2));
    expect(courseReads()).toHaveLength(0);
  });

  /** A closed lid stops every timer; waking must not wait for the next quarter hour. */
  it('asks at once when the computer wakes from sleep', async () => {
    render(<CourseSync />);
    await act(() => vi.advanceTimersByTimeAsync(60 * 1000));
    expect(courseReads()).toHaveLength(0);

    // Twenty minutes asleep: the clock jumps, no timer ran in between.
    vi.setSystemTime(Date.now() + 20 * 60 * 1000);
    await act(() => vi.advanceTimersByTimeAsync(30 * 1000));
    expect(courseReads()).toHaveLength(1);
  });

  it('asks when the student comes back to the window after a while', async () => {
    render(<CourseSync />);
    window.dispatchEvent(new Event('focus'));
    expect(courseReads()).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(6 * 60 * 1000));
    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(courseReads()).toHaveLength(1);
  });
});
