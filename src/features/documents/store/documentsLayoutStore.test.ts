import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentsLayoutStore } from './documentsLayoutStore';

beforeEach(() => useDocumentsLayoutStore.setState({ sidebarView: 'files' }));

describe('documents layout', () => {
  it('shows the files to begin with', () => {
    expect(useDocumentsLayoutStore.getInitialState().sidebarView).toBe('files');
  });

  it('switches between the files and the favorites', () => {
    const { setSidebarView } = useDocumentsLayoutStore.getState();
    setSidebarView('favorites');
    expect(useDocumentsLayoutStore.getState().sidebarView).toBe('favorites');
    setSidebarView('files');
    expect(useDocumentsLayoutStore.getState().sidebarView).toBe('files');
  });

  it('remembers the view, and nothing else', () => {
    const options = useDocumentsLayoutStore.persist.getOptions();
    expect(options.name).toBe('uni-pilot.documents-layout');
    expect(
      options.partialize?.({ ...useDocumentsLayoutStore.getState(), sidebarView: 'favorites' }),
    ).toEqual({ sidebarView: 'favorites' });
  });
});
