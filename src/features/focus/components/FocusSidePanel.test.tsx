import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusSidePanel } from '@/features/focus/components/FocusSidePanel';

describe('FocusSidePanel', () => {
  it('keeps the panel mounted and finishes closing after the transform transition', () => {
    const onAfterClose = vi.fn();
    const props = {
      id: 'test-focus-panel',
      title: 'Test panel',
      closeLabel: 'Close test panel',
      onClose: vi.fn(),
      onAfterClose,
    };
    const view = render(
      <FocusSidePanel {...props} open>
        <button type="button">Panel action</button>
      </FocusSidePanel>,
    );
    const panel = screen.getByRole('dialog', { name: 'Test panel' });

    view.rerender(
      <FocusSidePanel {...props} open={false}>
        <button type="button">Panel action</button>
      </FocusSidePanel>,
    );

    expect(document.getElementById('test-focus-panel')).toBe(panel);
    expect(onAfterClose).not.toHaveBeenCalled();
    fireEvent.transitionEnd(panel, { propertyName: 'opacity' });
    expect(onAfterClose).not.toHaveBeenCalled();
    fireEvent.transitionEnd(panel, { propertyName: 'transform' });
    expect(onAfterClose).toHaveBeenCalledOnce();
  });
});
