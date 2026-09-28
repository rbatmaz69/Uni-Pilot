import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type { IliasCourse } from '@/features/integrations/lib/iliasSync';
import { useCourseStore } from './courseStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};

const COURSE: IliasCourse = {
  refId: '100100',
  providerType: 'crs',
  title: '100001 Beispielsysteme 1 - WS25',
  description: null,
  area: 'H3 Labor für Beispielsysteme',
  online: true,
  period: null,
  properties: [],
};

beforeEach(() => {
  invoke.mockReset();
  useCourseStore.setState({
    installation: null,
    courses: null,
    contents: {},
    assignments: {},
    failure: null,
    loading: {},
  });
});

describe('the course store', () => {
  it('keeps what ILIAS listed, and when', async () => {
    invoke.mockResolvedValue([COURSE]);
    await useCourseStore.getState().loadCourses(HHN);

    const state = useCourseStore.getState();
    expect(state.courses?.items).toEqual([COURSE]);
    expect(state.courses?.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.installation).toBe('ilias.hs-heilbronn.de');
    expect(state.loading.courses).toBe(false);
  });

  /** ILIAS forgets the sign-in on quit; what was read before must not vanish with it. */
  it('keeps the last list when the sign-in has ended', async () => {
    invoke.mockResolvedValueOnce([COURSE]).mockRejectedValueOnce({ kind: 'signedOut' });
    await useCourseStore.getState().loadCourses(HHN);
    await useCourseStore.getState().loadCourses(HHN);

    const state = useCourseStore.getState();
    expect(state.courses?.items).toEqual([COURSE]);
    expect(state.failure?.kind).toBe('session-expired');
  });

  it('clears the failure once ILIAS answers again', async () => {
    invoke.mockRejectedValueOnce({ kind: 'signedOut' }).mockResolvedValueOnce([COURSE]);
    await useCourseStore.getState().loadCourses(HHN);
    await useCourseStore.getState().loadCourses(HHN);
    expect(useCourseStore.getState().failure).toBeNull();
  });

  it('asks once while a request is still out', async () => {
    let answer: (value: unknown) => void = () => undefined;
    invoke.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const first = useCourseStore.getState().loadCourses(HHN);
    const second = useCourseStore.getState().loadCourses(HHN);
    answer([COURSE]);
    await Promise.all([first, second]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps contents and assignments by the object they belong to', async () => {
    invoke.mockResolvedValue([]);
    await useCourseStore.getState().loadContents(HHN, 'fold', '100120');
    await useCourseStore.getState().loadAssignments(HHN, '100130');

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'ilias_sync_contents',
      'ilias_sync_assignments',
    ]);
    expect(Object.keys(useCourseStore.getState().contents)).toEqual(['100120']);
    expect(Object.keys(useCourseStore.getState().assignments)).toEqual(['100130']);
  });

  it("forgets another installation's courses", async () => {
    useCourseStore.setState({
      installation: 'ilias.example.org',
      courses: { items: [COURSE], loadedAt: '2026-09-01T10:00:00.000Z' },
    });
    invoke.mockRejectedValue({ kind: 'signedOut' });
    await useCourseStore.getState().loadCourses(HHN);

    expect(useCourseStore.getState().courses).toBeNull();
    expect(useCourseStore.getState().installation).toBe('ilias.hs-heilbronn.de');
  });

  /** A laptop asleep over a break: ILIAS forgot, the sign-on did not. */
  it('gets a new session through the sign-on before calling anyone signed out', async () => {
    let signedIn = false;
    invoke.mockImplementation((command) => {
      if (command === 'ilias_sync_reauth') {
        signedIn = true;
        return Promise.resolve(true);
      }
      return signedIn
        ? Promise.resolve([COURSE])
        : vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'signedOut' })();
    });
    await useCourseStore.getState().loadCourses(HHN);

    expect(useCourseStore.getState().courses?.items).toEqual([COURSE]);
    expect(useCourseStore.getState().failure).toBeNull();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'ilias_sync_courses',
      'ilias_sync_reauth',
      'ilias_sync_courses',
    ]);
  });

  it('asks the student when the sign-on has forgotten them too', async () => {
    invoke.mockImplementation((command) =>
      command === 'ilias_sync_reauth'
        ? Promise.resolve(false)
        : vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind: 'signedOut' })(),
    );
    await useCourseStore.getState().loadCourses(HHN);

    expect(useCourseStore.getState().failure?.kind).toBe('session-expired');
    expect(invoke.mock.calls.filter(([command]) => command === 'ilias_sync_reauth')).toHaveLength(
      1,
    );
  });
});
