import { describe, expect, it } from 'vitest';
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
});
