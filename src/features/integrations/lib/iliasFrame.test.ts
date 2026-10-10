import { afterEach, describe, expect, it } from 'vitest';
import {
  FALLBACK_COLUMN,
  FALLBACK_GUTTER,
  measureColumn,
  parseCssColour,
  readFrameColour,
  readGutter,
  sameMetrics,
} from './iliasFrame';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.body.innerHTML = '';
});

describe('parseCssColour', () => {
  it('reads hex, which is how the light themes write the frame', () => {
    expect(parseCssColour('#e3eff9')).toEqual([0xe3, 0xef, 0xf9]);
    expect(parseCssColour('  #100F0F ')).toEqual([0x10, 0x0f, 0x0f]);
    expect(parseCssColour('#fa0')).toEqual([0xff, 0xaa, 0x00]);
  });

  it('ignores opacity: the gutter is opaque', () => {
    expect(parseCssColour('#e3eff980')).toEqual([0xe3, 0xef, 0xf9]);
    expect(parseCssColour('#abcd')).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it('reads rgb() as a browser reports a computed colour', () => {
    expect(parseCssColour('rgb(227, 239, 249)')).toEqual([227, 239, 249]);
    expect(parseCssColour('rgba(227, 239, 249, 0.5)')).toEqual([227, 239, 249]);
    expect(parseCssColour('rgb(227 239 249 / 50%)')).toEqual([227, 239, 249]);
    expect(parseCssColour('rgb(300, -4, 249)')).toEqual([255, 0, 249]);
  });

  /** The dark theme's frame; the numbers are what the design tooling gives for the same oklch(). */
  it('converts oklch(), which is how the dark theme writes the frame', () => {
    expect(parseCssColour('oklch(0.145 0.016 258)')).toEqual([0x06, 0x0a, 0x11]);
    expect(parseCssColour('oklch(0.175 0.026 242)')).toEqual([0x06, 0x12, 0x1b]);
    expect(parseCssColour('oklch(1 0 0)')).toEqual([255, 255, 255]);
    expect(parseCssColour('oklch(0 0 0)')).toEqual([0, 0, 0]);
    expect(parseCssColour('oklch(0.5 0 0)')).toEqual([0x63, 0x63, 0x63]);
  });

  it('reads percentages, degrees and an alpha in oklch()', () => {
    expect(parseCssColour('oklch(14.5% 0.016 258deg / 0.9)')).toEqual([0x06, 0x0a, 0x11]);
    expect(parseCssColour('oklch(50% 0% none)')).toEqual([0x63, 0x63, 0x63]);
  });

  /** Better to leave the window alone than to guess at a colour. */
  it('gives up on anything else', () => {
    for (const value of [
      '',
      '   ',
      'red',
      'var(--frame-to)',
      'color-mix(in oklab, red, blue)',
      '#12',
      'oklch(0.5 0)',
      'rgb(1, 2)',
    ]) {
      expect(parseCssColour(value), value).toBeNull();
    }
  });
});

describe('what is read from the page', () => {
  it('takes the column from the right edge of the panel', () => {
    document.body.innerHTML = '<aside id="panel"></aside>';
    const panel = document.getElementById('panel') as HTMLElement;
    panel.getBoundingClientRect = () => new DOMRect(72, 0, 240.4, 600);
    expect(measureColumn(panel)).toBe(312);
  });

  it('falls back to the rail and panel as drawn where nothing is laid out', () => {
    document.body.innerHTML = '<aside id="panel"></aside>';
    expect(measureColumn(document.getElementById('panel'))).toBe(FALLBACK_COLUMN);
    expect(measureColumn(null)).toBe(FALLBACK_COLUMN);
  });

  it('reads the frame’s gutter and colour from the stylesheet’s tokens', () => {
    document.documentElement.style.setProperty('--frame-gutter', '12px');
    document.documentElement.style.setProperty('--frame-to', 'oklch(0.145 0.016 258)');
    expect(readGutter()).toBe(12);
    expect(readFrameColour()).toEqual([0x06, 0x0a, 0x11]);
  });

  it('knows nothing of a stylesheet that is not there', () => {
    expect(readGutter()).toBe(FALLBACK_GUTTER);
    expect(readFrameColour()).toBeNull();
  });

  it('tells a changed layout from one that is the same', () => {
    const layout = { column: 312, gutter: 8, frame: [1, 2, 3] as const };
    expect(sameMetrics(layout, { ...layout, frame: [1, 2, 3] })).toBe(true);
    expect(sameMetrics(layout, { ...layout, column: 313 })).toBe(false);
    expect(sameMetrics(layout, { ...layout, gutter: 0 })).toBe(false);
    expect(sameMetrics(layout, { ...layout, frame: [1, 2, 4] })).toBe(false);
    expect(sameMetrics(layout, { ...layout, frame: null })).toBe(false);
    expect(sameMetrics({ ...layout, frame: null }, { ...layout, frame: null })).toBe(true);
  });
});
