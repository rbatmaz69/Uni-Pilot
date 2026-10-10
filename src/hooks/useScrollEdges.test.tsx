import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useScrollEdges } from './useScrollEdges';

function Scroller() {
  const ref = useRef<HTMLDivElement>(null);
  const { above, below } = useScrollEdges(ref);
  return (
    <div
      ref={ref}
      data-testid="scroller"
      data-above={above || undefined}
      data-below={below || undefined}
    >
      <p>content</p>
    </div>
  );
}

/** jsdom lays nothing out: give the container the measurements a browser would. */
function measure(element: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { value: sizes.scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: sizes.clientHeight, configurable: true });
}

describe('useScrollEdges', () => {
  it('reports nothing for content that fits', () => {
    render(<Scroller />);

    expect(screen.getByTestId('scroller')).not.toHaveAttribute('data-above');
    expect(screen.getByTestId('scroller')).not.toHaveAttribute('data-below');
  });

  it('shows more below at the top of a long list, then more above at the bottom', () => {
    render(<Scroller />);
    const scroller = screen.getByTestId('scroller');
    measure(scroller, { scrollHeight: 450, clientHeight: 300 });

    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(scroller).toHaveAttribute('data-below', 'true');
    expect(scroller).not.toHaveAttribute('data-above');

    scroller.scrollTop = 70;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(scroller).toHaveAttribute('data-below', 'true');
    expect(scroller).toHaveAttribute('data-above', 'true');

    scroller.scrollTop = 150;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(scroller).toHaveAttribute('data-above', 'true');
    expect(scroller).not.toHaveAttribute('data-below');
  });

  it('notices content added to a list that was short enough before', async () => {
    render(<Scroller />);
    const scroller = screen.getByTestId('scroller');
    measure(scroller, { scrollHeight: 450, clientHeight: 300 });

    await act(async () => {
      scroller.append(document.createElement('p'));
      await Promise.resolve();
    });
    expect(scroller).toHaveAttribute('data-below', 'true');
  });
});
