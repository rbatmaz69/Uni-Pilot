import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { useAutoSignInStore } from './autoSignInStore';

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
const HOST = 'ilias.hs-heilbronn.de';
const SET_UP = {
  credentials: true,
  username: 'student',
  device: 'Uni Pilot',
  stale: false,
  face: false,
};

const known = () => useAutoSignInStore.getState().byHost[HOST];

beforeEach(() => {
  invoke.mockReset();
  useAutoSignInStore.setState({ byHost: {}, signingIn: false, autoUnlock: false, faceBar: null });
});

describe('what Uni Pilot remembers about the stored sign-in', () => {
  it('keeps what Rust said, the face among it', async () => {
    invoke.mockResolvedValue({ ...SET_UP, face: true });
    await useAutoSignInStore.getState().load(HHN);
    expect(known()).toEqual({ ...SET_UP, face: true });
  });

  it('learns from face unlock what is stored', () => {
    const store = useAutoSignInStore.getState();
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    store.faceEnrolled(HHN);
    expect(known()?.face).toBe(true);
    store.noteFaceFailure(HHN, { kind: 'noFace' });
    expect(known()?.face).toBe(false);
    store.noteFaceFailure(HHN, { kind: 'signIn', message: { kind: 'wrongPassword' } });
    expect(known()?.stale).toBe(true);
    store.noteFaceFailure(HHN, { kind: 'notSetUp' });
    expect(known()?.credentials).toBe(false);
  });

  it('marks a refused password, so the notice stops offering it', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    invoke.mockRejectedValue({ kind: 'wrongPassword' });

    const result = await useAutoSignInStore.getState().signIn(HHN);

    expect(result.signedIn).toBe(false);
    expect(result.message).toMatch(/password was not accepted/);
    expect(known()).toEqual({ ...SET_UP, stale: true });
  });

  it('learns that nothing is stored when Rust finds nothing', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    invoke.mockRejectedValue({ kind: 'notSetUp' });
    await useAutoSignInStore.getState().signIn(HHN);
    expect(known()?.credentials).toBe(false);
  });

  it('counts a saved password as accepted again', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: { ...SET_UP, stale: true } } });
    invoke.mockResolvedValue({ ...SET_UP });
    await useAutoSignInStore
      .getState()
      .save(HHN, { username: 'student', password: 'new', authenticator: 'S', device: '' });
    expect(known()?.stale).toBe(false);
  });

  /** The face goes with Forget; turning the camera on by itself waits for a new one. */
  it('turns automatic face unlock off again on Forget', async () => {
    useAutoSignInStore.setState({
      byHost: { [HOST]: { ...SET_UP, face: true } },
      autoUnlock: true,
    });
    invoke.mockResolvedValue(undefined);
    await useAutoSignInStore.getState().forget(HHN);
    expect(useAutoSignInStore.getState().autoUnlock).toBe(false);
    expect(known()?.face).toBe(false);
  });

  it('signs in once at a time', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    let finish: (signedIn: boolean) => void = () => undefined;
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const first = useAutoSignInStore.getState().signIn(HHN);
    const second = await useAutoSignInStore.getState().signIn(HHN);
    finish(true);

    expect(second.signedIn).toBe(false);
    expect((await first).signedIn).toBe(true);
    expect(invoke).toHaveBeenCalledOnce();
  });
});
