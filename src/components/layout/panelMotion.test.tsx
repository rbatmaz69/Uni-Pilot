import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/store/uiStore';
import { AppLayout } from './AppLayout';
import { PanelHeader } from './Panel';
import { SectionPanel } from './SectionPanel';

interface Run {
  element: Element;
  keyframes: Record<string, unknown>;
  finish: () => void;
}

let runs: Run[] = [];
let reduced = false;
const realRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')!;

/** jsdom has no Web Animations: a stand-in that records what was asked and finishes on demand. */
function fakeAnimations() {
  runs = [];
  HTMLElement.prototype.animate = function (
    this: HTMLElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
  ) {
    let finish = () => {};
    const animation = {
      id: '',
      finished: new Promise((resolve) => {
        finish = () => resolve(animation);
      }),
    };
    runs.push({
      element: this,
      keyframes: keyframes as Record<string, unknown>,
      finish: () => finish(),
    });
    return animation as unknown as Animation;
  };
  HTMLElement.prototype.getAnimations = function (this: HTMLElement) {
    return runs
      .filter((run) => run.element === this)
      .map(() => ({ id: 'panel-motion' }) as Animation);
  };
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
  })) as never;
  // Panels have a width, as they would on screen.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const panel = this.classList.contains('section-panel');
    return {
      x: 72,
      y: 44,
      left: 72,
      top: 44,
      width: panel ? 300 : 1000,
      height: 800,
      right: panel ? 372 : 1072,
      bottom: 844,
      toJSON() {},
    };
  };
}

function Panel({ name }: { name: string }) {
  return (
    <SectionPanel label={`${name} panel`}>
      <PanelHeader title={name} />
    </SectionPanel>
  );
}

function renderShell(start = '/plain') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/plain" element={<Link to="/mail">To mail</Link>} />
          <Route
            path="/mail"
            element={
              <>
                <Panel name="Mail" />
                <Link to="/plain">To plain</Link>
                <Link to="/settings">To settings</Link>
              </>
            }
          />
          <Route path="/settings" element={<Panel name="Settings" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Lets the microtask that settles a commit's arrivals and departures run. */
const settle = () => act(() => Promise.resolve());
const runsOn = (selector: string) => runs.filter((run) => run.element.matches(selector));
const ghosts = () => document.querySelectorAll<HTMLElement>('.panel-ghost');

beforeEach(() => {
  reduced = false;
  fakeAnimations();
  // Nothing moves before the student has done something.
  fireEvent.pointerDown(window);
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', realRect);
});

describe('Panels in motion', () => {
  it('slides a panel in from under the card, which keeps its own edge until it rests', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: 'To mail' }));
    await settle();

    const panel = screen.getByRole('complementary', { name: 'Mail panel' });
    const slide = runs.find((run) => run.element === panel && 'marginRight' in run.keyframes);
    expect(slide?.keyframes.marginRight).toEqual(['-300px', '0px']);
    const focus = runs.find((run) => run.element === panel && 'filter' in run.keyframes);
    expect(focus?.keyframes.filter).toEqual(['blur(16px)', 'blur(10px)', 'blur(4px)', 'blur(0px)']);
    const card = screen.getByRole('main').closest('.workspace')!;
    expect(card).toHaveAttribute('data-panel-moving');

    await act(async () => {
      runs.forEach((run) => run.finish());
      await Promise.resolve();
    });
    expect(card).not.toHaveAttribute('data-panel-moving');
  });

  it('lets a still copy of the panel slide out from under the card as its page goes', async () => {
    const user = userEvent.setup();
    renderShell('/mail');

    await user.click(screen.getByRole('link', { name: 'To plain' }));
    await settle();

    expect(screen.queryByRole('complementary', { name: 'Mail panel' })).toBeNull();
    const [ghost] = ghosts();
    expect(ghost).toBeDefined();
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost!.inert).toBe(true);
    expect(ghost!.closest('.section-panel-slot')).not.toBeNull();
    const slide = runs.find((run) => run.element === ghost && 'marginRight' in run.keyframes);
    // From where it stood (jsdom spells a zero margin without its unit).
    expect(slide?.keyframes.marginRight).toEqual([expect.stringMatching(/^0(px)?$/), '-300px']);

    await act(async () => {
      runs.forEach((run) => run.finish());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ghosts()).toHaveLength(0);
  });

  it('fades one panel out over the next when moving between two', async () => {
    const user = userEvent.setup();
    renderShell('/mail');

    await user.click(screen.getByRole('link', { name: 'To settings' }));
    await settle();

    const [ghost] = ghosts();
    expect(ghost!.style.position).toBe('absolute');
    expect(ghost!.parentElement).toHaveClass('panel-stage');
    const settings = screen.getByRole('complementary', { name: 'Settings panel' });
    expect(runsOn('.panel-ghost').some((run) => 'opacity' in run.keyframes)).toBe(true);
    // Both 300 wide here: the card has nowhere to go, the panels only cross.
    const settle_ = runs.find((run) => run.element === settings && 'marginRight' in run.keyframes);
    expect(settle_?.keyframes.marginRight).toEqual(['0px', '0px']);
  });

  it('slides out when hidden from the title bar, in its own place', async () => {
    const user = userEvent.setup();
    renderShell('/mail');

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    await settle();

    expect(ghosts()).toHaveLength(1);
    expect(runsOn('.panel-ghost').length).toBeGreaterThan(0);
  });

  it('keeps still when the system asks for less motion', async () => {
    reduced = true;
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: 'To mail' }));
    await settle();
    await user.click(screen.getByRole('link', { name: 'To plain' }));
    await settle();

    expect(runs).toHaveLength(0);
    expect(ghosts()).toHaveLength(0);
  });

  it('keeps still in ILIAS mode, whose native view is laid out from the panel', async () => {
    useUiStore.setState({ iliasMode: true });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: 'To mail' }));
    await settle();

    expect(runs).toHaveLength(0);
  });

  it('never moves a panel that asks not to', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/plain']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/plain" element={<Link to="/still">Go</Link>} />
            <Route
              path="/still"
              element={
                <SectionPanel label="Still panel" motion={false}>
                  <PanelHeader title="Still" />
                </SectionPanel>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'Go' }));
    await settle();

    expect(screen.getByRole('complementary', { name: 'Still panel' })).toBeVisible();
    expect(runs).toHaveLength(0);
  });

  it('keeps still while the window opens, before the student has done anything', async () => {
    vi.resetModules();
    const { panelMotionRef } = await import('./panelMotion');
    const panel = document.createElement('aside');
    panel.className = 'section-panel';
    document.body.append(panel);

    panelMotionRef(panel);
    await settle();

    expect(runs).toHaveLength(0);
    panel.remove();
  });
});
