import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sheetGeometry } from '@/features/documents/lib/pageSheets';
import { PageZoom } from './PageZoom';

const layout = {
  ...sheetGeometry({ width: 800, marginTop: 76, marginBottom: 76, gap: 28 })!,
  count: 4,
  lead: 0,
};

function open(zoom: number) {
  const onZoom = vi.fn();
  render(<PageZoom stage={null} layout={layout} zoom={zoom} onZoom={onZoom} />);
  return onZoom;
}

describe('PageZoom', () => {
  it('shows how many pages the note has and its zoom', () => {
    open(0.75);
    const bar = screen.getByRole('group', { name: 'Pages and zoom' });
    expect(bar).toHaveTextContent('Page 1 of 4');
    expect(screen.getByRole('button', { name: 'Zoom 75%, reset to 100%' })).toHaveTextContent(
      '75%',
    );
  });

  it('zooms out and in by one step and back to actual size', () => {
    const onZoom = open(0.75);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(onZoom).toHaveBeenLastCalledWith(0.67);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onZoom).toHaveBeenLastCalledWith(0.9);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom 75%, reset to 100%' }));
    expect(onZoom).toHaveBeenLastCalledWith(1);
  });

  it('stops at the smallest and largest zoom', () => {
    open(0.25);
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  });
});
