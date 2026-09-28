import { beforeEach, describe, expect, it } from 'vitest';
import { useSpaceStore } from './spaceStore';

beforeEach(() => useSpaceStore.setState({ spaces: [], picked: null }));

describe('document spaces', () => {
  it('starts with none added: Documents and ILIAS are always there', () => {
    expect(useSpaceStore.getInitialState().spaces).toEqual([]);
  });

  it('adds, renames and removes a space without touching its folder', () => {
    const { addSpace, updateSpace, removeSpace } = useSpaceStore.getState();
    const personal = addSpace({ name: 'Personal', folder: 'Personal' });
    const work = addSpace({ name: 'Work', folder: 'Job/Work' });
    expect(useSpaceStore.getState().spaces).toEqual([personal, work]);
    expect(useSpaceStore.getState().picked).toBe(work.id);
    expect(personal.id).not.toBe(work.id);

    updateSpace(personal.id, { name: 'Privat' });
    expect(useSpaceStore.getState().spaces[0]).toEqual({ ...personal, name: 'Privat' });

    removeSpace(personal.id);
    expect(useSpaceStore.getState().spaces).toEqual([work]);
    expect(useSpaceStore.getState().picked).toBe(work.id);
    removeSpace(work.id);
    expect(useSpaceStore.getState().picked).toBe('documents');
  });

  it('remembers the spaces as an app setting, but not which one is open', () => {
    const options = useSpaceStore.persist.getOptions();
    expect(options.name).toBe('uni-pilot.document-spaces');
    const space = { id: 'p', name: 'Personal', folder: 'Personal' };
    expect(
      options.partialize?.({ ...useSpaceStore.getState(), spaces: [space], picked: 'p' }),
    ).toEqual({ spaces: [space] });
  });
});
