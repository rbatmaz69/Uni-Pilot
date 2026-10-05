import { describe, expect, it } from 'vitest';
import { createDrawingPreset } from './drawingPresets';

describe('visual note presets', () => {
  it('creates an editable, coloured sticky note around the canvas center', () => {
    const preset = createDrawingPreset('sticky-yellow', { x: 400, y: 300 });
    expect(preset.elements[0]).toMatchObject({
      type: 'rectangle',
      x: 285,
      y: 197.5,
      width: 230,
      height: 205,
      backgroundColor: '#fff1b8',
      label: { text: 'Write an idea…' },
    });
  });

  it('creates a flow with bound arrows that follow its cards', () => {
    const preset = createDrawingPreset('flow', { x: 400, y: 300 });
    const cards = preset.elements.filter((element) => element.type === 'rectangle');
    const arrows = preset.elements.filter((element) => element.type === 'arrow');

    expect(cards).toHaveLength(3);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toMatchObject({
      start: { id: cards[0]?.id },
      end: { id: cards[1]?.id },
    });
    expect(arrows[1]).toMatchObject({
      start: { id: cards[1]?.id },
      end: { id: cards[2]?.id },
    });
  });

  it('provides separate shapes, cards, and study layouts', () => {
    for (const id of [
      'rectangle',
      'ellipse',
      'diamond',
      'arrow',
      'study-card',
      'compare',
      'cornell',
      'study-board',
      'mind-map',
    ] as const) {
      const preset = createDrawingPreset(id, { x: 0, y: 0 });
      expect(preset.elements.length).toBeGreaterThan(0);
    }
  });
});
