import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useUiStore } from '@/store/uiStore';
import { AppLayout } from './AppLayout';
import { PanelHeader } from './Panel';
import { SectionPanel, type PanelResize } from './SectionPanel';

const RESIZE: PanelResize = { id: 'demo', defaultWidth: 360, min: 280, max: 600 };

function renderShell(resize: PanelResize | null = RESIZE) {
  return render(
    <MemoryRouter initialEntries={['/panel']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/panel"
            element={
              <SectionPanel label="Demo panel" {...(resize ? { resize } : {})}>
                <PanelHeader title="Demo" />
              </SectionPanel>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const edge = () => screen.getByRole('separator', { name: 'Resize sidebar' });
/** The width the shell gives the panel and the title bar's lead, above the tabs. */
const shellWidth = () =>
  (screen.getByRole('main').closest('.app-column') as HTMLElement).style.getPropertyValue(
    '--panel-width',
  );

describe('A resizable section panel', () => {
  it('starts at its default width, which the title bar lines its tabs up with', () => {
    renderShell();

    expect(edge()).toHaveAttribute('aria-valuenow', '360');
    expect(edge()).toHaveAttribute('aria-valuemin', '280');
    expect(edge()).toHaveAttribute('aria-valuemax', '600');
    expect(shellWidth()).toBe('min(360px, 50vw)');
  });

  it('follows the edge as it is dragged, within its bounds, and keeps the width', () => {
    renderShell();

    fireEvent.pointerDown(edge(), { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(edge(), { clientX: 480, pointerId: 1 });
    expect(edge()).toHaveAttribute('aria-valuenow', '440');
    fireEvent.pointerMove(edge(), { clientX: 2000, pointerId: 1 });
    expect(edge()).toHaveAttribute('aria-valuenow', '600');
    fireEvent.pointerUp(edge(), { pointerId: 1 });
    // Once let go, moving the pointer changes nothing.
    fireEvent.pointerMove(edge(), { clientX: 100, pointerId: 1 });

    expect(edge()).toHaveAttribute('aria-valuenow', '600');
    expect(useUiStore.getState().panelWidths).toEqual({ demo: 600 });
    expect(shellWidth()).toBe('min(600px, 50vw)');
    expect(document.documentElement.dataset.resizing).toBeUndefined();
  });

  it('moves with the arrow keys, Home and End, and goes back to its default on a double click', async () => {
    const user = userEvent.setup();
    renderShell();
    edge().focus();

    await user.keyboard('{ArrowLeft}');
    expect(edge()).toHaveAttribute('aria-valuenow', '344');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(edge()).toHaveAttribute('aria-valuenow', '408');
    await user.keyboard('{Home}');
    expect(edge()).toHaveAttribute('aria-valuenow', '280');
    await user.keyboard('{End}');
    expect(edge()).toHaveAttribute('aria-valuenow', '600');

    await user.dblClick(edge());
    expect(edge()).toHaveAttribute('aria-valuenow', '360');
    expect(useUiStore.getState().panelWidths).toEqual({});
  });

  it('follows the edge past its narrowest, blurring as it goes, and springs back if let go early', () => {
    renderShell();
    const panel = screen.getByRole('complementary', { name: 'Demo panel' });

    fireEvent.pointerDown(edge(), { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(edge(), { clientX: 200, pointerId: 1 });
    // 160 wide: below its narrowest (280), followed but not kept.
    expect(shellWidth()).toBe('min(160px, 50vw)');
    expect(panel.style.filter).toMatch(/^blur\(\d+(\.\d)?px\)$/);
    expect(Number(panel.style.opacity)).toBeLessThan(1);
    expect(useUiStore.getState().panelWidths).toEqual({ demo: 280 });

    fireEvent.pointerUp(edge(), { pointerId: 1 });
    expect(useUiStore.getState().panelOpen).toBe(true);
    expect(shellWidth()).toBe('min(280px, 50vw)');
    expect(panel.style.filter).toBe('');
    expect(panel.style.opacity).toBe('');
  });

  it('closes when let go far enough past its narrowest, and opens again as wide as before', async () => {
    const user = userEvent.setup();
    renderShell();

    fireEvent.pointerDown(edge(), { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(edge(), { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(edge(), { pointerId: 1 });

    expect(useUiStore.getState().panelOpen).toBe(false);
    expect(screen.queryByRole('complementary', { name: 'Demo panel' })).toBeNull();
    expect(document.documentElement.dataset.resizing).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(edge()).toHaveAttribute('aria-valuenow', '360');
    expect(shellWidth()).toBe('min(360px, 50vw)');
  });

  it('opens at the width the student left it, and never outside its bounds', () => {
    useUiStore.setState({ panelWidths: { demo: 9999 } });
    renderShell();

    expect(edge()).toHaveAttribute('aria-valuenow', '600');
  });

  it('gives the default width back to the shell when it is hidden', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(shellWidth()).toBe('');
  });

  it('has no edge to drag unless it asks for one', () => {
    renderShell(null);

    expect(screen.getByRole('complementary', { name: 'Demo panel' })).toBeVisible();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(shellWidth()).toBe('');
  });

  it('sets its own width on its own, outside the shell', () => {
    render(
      <SectionPanel label="Alone" resize={RESIZE}>
        <PanelHeader title="Alone" />
      </SectionPanel>,
    );

    expect(screen.getByRole('complementary', { name: 'Alone' })).toHaveStyle({ width: '360px' });
  });
});
