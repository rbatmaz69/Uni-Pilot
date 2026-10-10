import { afterEach, describe, expect, it } from 'vitest';
import { useNoteStyleStore } from './noteStyleStore';

const migrate = (state: object, version: number) =>
  useNoteStyleStore.persist.getOptions().migrate?.(state, version);

describe('note style settings', () => {
  it('opens new notes on A4 sheets', () => {
    expect(useNoteStyleStore.getInitialState().layout).toBe('pages');
  });

  it('moves the former default card onto sheets and keeps a chosen full width', () => {
    expect(migrate({ layout: 'card', font: 'serif' }, 0)).toEqual({
      layout: 'pages',
      font: 'iowan',
    });
    expect(migrate({ layout: 'full' }, 0)).toEqual({ layout: 'full' });
  });

  it('keeps the zoom within what the sheets allow', () => {
    useNoteStyleStore.getState().setZoom(9);
    expect(useNoteStyleStore.getState().zoom).toBe(2);
    useNoteStyleStore.getState().setZoom(0.5);
    expect(useNoteStyleStore.getState().zoom).toBe(0.5);
  });

  it('keeps a card chosen after sheets arrived', () => {
    expect(migrate({ layout: 'card' }, 1)).toEqual({ layout: 'card' });
  });

  it('names the typeface a font family stood for, once', () => {
    expect(migrate({ font: 'sans', width: 'wide' }, 1)).toEqual({ font: 'inter', width: 'wide' });
    expect(migrate({ font: 'mono' }, 1)).toEqual({ font: 'quattro' });
    expect(migrate({ font: 'literata' }, 2)).toEqual({ font: 'literata' });
  });

  it('opens notes in a screen face at the default size and spacing', () => {
    expect(useNoteStyleStore.getInitialState()).toMatchObject({
      font: 'inter',
      textSize: 'm',
      lineSpacing: 'normal',
    });
  });

  it('keeps the Textmarker on across sessions but never its spotlight', () => {
    const store = useNoteStyleStore.getState();
    store.toggleMarkers();
    store.setMarkerOnly('claim');
    expect(useNoteStyleStore.getState()).toMatchObject({ markers: true, markerOnly: 'claim' });
    expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
      state: { markers: true, markerOnly: null },
    });
    useNoteStyleStore.getState().toggleMarkers();
    expect(useNoteStyleStore.getState()).toMatchObject({ markers: false, markerOnly: null });
  });

  describe('note properties', () => {
    afterEach(() => {
      useNoteStyleStore.setState(useNoteStyleStore.getInitialState());
      localStorage.clear();
    });

    it('shows them by default and toggles them', () => {
      expect(useNoteStyleStore.getInitialState().properties).toBe(true);
      useNoteStyleStore.getState().toggleProperties();
      expect(useNoteStyleStore.getState().properties).toBe(false);
      useNoteStyleStore.getState().toggleProperties();
      expect(useNoteStyleStore.getState().properties).toBe(true);
    });

    it('persists the choice with the other page settings', () => {
      useNoteStyleStore.getState().toggleProperties();
      expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
        state: { properties: false },
      });
    });

    it('opens settings saved before the block existed with it shown', async () => {
      localStorage.setItem(
        'uni-pilot.note-style',
        JSON.stringify({ state: { layout: 'card', sidebar: false }, version: 2 }),
      );
      await useNoteStyleStore.persist.rehydrate();
      expect(useNoteStyleStore.getState()).toMatchObject({
        layout: 'card',
        sidebar: false,
        properties: true,
      });
    });
  });
});
