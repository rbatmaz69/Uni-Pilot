import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';
import { AppLayout } from './AppLayout';
import { PanelBody, PanelHeader, PanelItem } from './Panel';
import { SectionPanel } from './SectionPanel';

const rail = () => screen.getByRole('complementary', { name: 'Main navigation' });
const frame = () => screen.getByRole('main').closest('.app-frame') as HTMLElement;
const card = () => screen.getByRole('main').closest('.workspace') as HTMLElement;
const slot = () => frame().querySelector('.section-panel-slot') as HTMLElement;
const demoPanel = () => screen.queryByRole('complementary', { name: 'Demo panel' });
const precedes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('The icon rail in the shell', () => {
  const pages = Object.values(NAV_ITEMS).filter((item) => item !== NAV_ITEMS.ilias);

  it.each(pages.map((item) => [item.label, item] as const))(
    'is on %s, icons only, with every page linked',
    (_label, current) => {
      renderApp(current.path);

      for (const item of Object.values(NAV_ITEMS))
        expect(within(rail()).getByRole('link', { name: item.label })).toHaveAttribute(
          'href',
          item.path,
        );
      expect(within(rail()).getByRole('link', { name: current.label })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(rail()).queryByText(current.label)).not.toBeInTheDocument();
    },
  );

  it('is the same strip when moving between pages, never a wider sidebar', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);
    const first = rail();

    await user.click(within(rail()).getByRole('link', { name: 'Calendar' }));

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeVisible();
    expect(rail()).toBe(first);
    expect(screen.queryByLabelText('Document spaces')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
  });

  /** In ILIAS mode the rail is the way out of ILIAS, so it stays. */
  it('stays in ILIAS mode, where it is the way back to Uni Pilot', () => {
    useUiStore.setState({ iliasMode: true });
    renderApp(NAV_ITEMS.documents.path);

    expect(rail()).toBeVisible();
    expect(within(rail()).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      NAV_ITEMS.calendar.path,
    );
  });
});

describe('Documents in the shell', () => {
  it('shows the rail first, then the documents sidebar', () => {
    renderApp(NAV_ITEMS.documents.path);

    const sidebar = screen.getByLabelText('Document spaces');
    expect(precedes(rail(), sidebar)).toBe(true);
    expect(within(rail()).getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('hides its own sidebar from the title bar, leaving the rail where it is', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.documents.path);

    await user.click(await screen.findByRole('button', { name: 'Hide sidebar' }));

    expect(screen.queryByLabelText('Document spaces')).toBeNull();
    expect(rail()).toBeVisible();
    // The preference every section's sidebar shares.
    expect(useUiStore.getState().panelOpen).toBe(false);
  });

  it('starts without its sidebar when the shared preference says hidden', async () => {
    useUiStore.setState({ panelOpen: false });
    renderApp(NAV_ITEMS.documents.path);

    expect(await screen.findByRole('button', { name: 'Show sidebar' })).toBeVisible();
    expect(screen.queryByLabelText('Document spaces')).toBeNull();
  });

  it('draws its own panel, so the shell keeps its panel slot empty', () => {
    renderApp(NAV_ITEMS.documents.path);

    expect(slot()).toBeEmptyDOMElement();
    expect(card()).not.toHaveAttribute('data-panel');
  });
});

describe('The frame and the card in the shell', () => {
  it('shows an ordinary page as a card on the frame, with the rail beside it', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(frame()).toContainElement(rail());
    expect(card()).not.toHaveAttribute('data-frame');
    expect(card()).not.toHaveAttribute('data-panel');
  });

  it('puts the title bar on the frame beside the rail, above the card', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const titleBar = screen.getByRole('banner', { name: 'Title bar' });

    expect(frame()).toContainElement(titleBar);
    expect(card()).not.toContainElement(titleBar);
    expect(rail()).not.toContainElement(titleBar);
    expect(precedes(rail(), titleBar)).toBe(true);
    expect(precedes(titleBar, card())).toBe(true);
    expect(titleBar).toHaveAttribute('data-tauri-drag-region');
  });

  it('puts the title bar above Documents too, which draws its own panel and card', () => {
    renderApp(NAV_ITEMS.documents.path);
    const titleBar = screen.getByRole('banner', { name: 'Title bar' });

    expect(precedes(titleBar, screen.getByRole('region', { name: 'Document explorer' }))).toBe(
      true,
    );
    // One row of tabs for the whole window; Documents keeps none of its own.
    expect(screen.getAllByRole('tablist', { name: 'Tabs' })).toHaveLength(1);
    expect(screen.queryByRole('tablist', { name: 'Open documents' })).toBeNull();
  });

  it('leaves the frame bare on Documents, which draws its own panel and card', () => {
    renderApp(NAV_ITEMS.documents.path);

    expect(card()).toHaveAttribute('data-frame', 'none');
    expect(frame()).toContainElement(rail());
  });

  it('keeps the frame around the page on every side in focus mode, without rail', () => {
    useFocusStore.setState({ focusMode: true });
    renderApp(NAV_ITEMS.focus.path);

    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(card()).not.toHaveAttribute('data-frame');
    expect(card()).not.toHaveAttribute('data-panel');
    expect(screen.queryByRole('banner')).toBeNull();
  });

  /**
   * ILIAS is the card: a native webview the window places beside this one, so
   * what is left here is the rail and the panel on the frame.
   */
  it('shows no card in ILIAS mode, only the rail on the frame, and no header', () => {
    useUiStore.setState({ iliasMode: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(frame()).toContainElement(rail());
    expect(screen.getByRole('main').closest('.workspace')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('leaves the shell unmarked outside ILIAS mode', () => {
    const { container } = renderApp(NAV_ITEMS.dashboard.path);
    expect(container.querySelector('.app-shell')).not.toHaveAttribute('data-ilias-mode');
  });

  it('marks the shell in ILIAS mode, so the stylesheet can fix the column’s width', () => {
    useUiStore.setState({ iliasMode: true });
    const { container } = renderApp(NAV_ITEMS.dashboard.path);
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-ilias-mode', 'true');
  });
});

/** The shell with two throwaway pages: one that brings a panel, one that does not. */
function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/with-panel"
            element={
              <>
                <h1>Page with a panel</h1>
                <Link to="/without-panel">Leave</Link>
                <SectionPanel label="Demo panel">
                  <PanelHeader title="Demo" />
                  <PanelBody>
                    <PanelItem label="First entry" onClick={() => {}} />
                  </PanelBody>
                </SectionPanel>
              </>
            }
          />
          <Route
            path="/without-panel"
            element={
              <>
                <h1>Page without a panel</h1>
                <Link to="/with-panel">Return</Link>
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Section panels in the shell', () => {
  it('leaves the slot empty and the card whole when a page brings no panel', () => {
    renderShell('/without-panel');

    expect(slot()).toBeEmptyDOMElement();
    expect(card()).not.toHaveAttribute('data-panel');
    expect(screen.queryByRole('button', { name: 'Hide sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).toBeNull();
  });

  it('shows the page’s panel between the rail and the card', () => {
    renderShell('/with-panel');

    const panel = screen.getByRole('complementary', { name: 'Demo panel' });
    expect(slot()).toContainElement(panel);
    // The rail runs the full height; the title bar, the panel and the card sit beside it.
    expect(rail().nextElementSibling).toContainElement(slot());
    expect(precedes(screen.getByRole('banner', { name: 'Title bar' }), panel)).toBe(true);
    expect(slot().nextElementSibling).toBe(card());
    // The panel is not part of the page's card.
    expect(card()).not.toContainElement(panel);
    expect(within(panel).getByRole('heading', { name: 'Demo' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'First entry' })).toBeVisible();
    expect(screen.getByRole('main')).not.toContainElement(panel);
  });

  it('joins the card to the panel', () => {
    renderShell('/with-panel');

    expect(card()).toHaveAttribute('data-panel', 'true');
  });

  it('hides the panel from the header, and the card spans the width again', async () => {
    const user = userEvent.setup();
    renderShell('/with-panel');

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Hide sidebar' }),
    );

    expect(demoPanel()).toBeNull();
    expect(slot()).toBeEmptyDOMElement();
    expect(card()).not.toHaveAttribute('data-panel');
    expect(useUiStore.getState().panelOpen).toBe(false);

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Show sidebar' }),
    );

    expect(demoPanel()).toBeVisible();
    expect(card()).toHaveAttribute('data-panel', 'true');
    expect(useUiStore.getState().panelOpen).toBe(true);
  });

  it('keeps offering the toggle while the panel is hidden', () => {
    useUiStore.setState({ panelOpen: false });
    renderShell('/with-panel');

    expect(demoPanel()).toBeNull();
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
    expect(card()).not.toHaveAttribute('data-panel');
  });

  it('gives the slot back when the student leaves for a page without a panel', async () => {
    const user = userEvent.setup();
    renderShell('/with-panel');

    await user.click(screen.getByRole('link', { name: 'Leave' }));

    expect(await screen.findByRole('heading', { name: 'Page without a panel' })).toBeVisible();
    expect(demoPanel()).toBeNull();
    expect(slot()).toBeEmptyDOMElement();
    expect(card()).not.toHaveAttribute('data-panel');
    expect(screen.queryByRole('button', { name: 'Hide sidebar' })).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Return' }));

    expect(await screen.findByRole('heading', { name: 'Page with a panel' })).toBeVisible();
    expect(demoPanel()).toBeVisible();
    expect(card()).toHaveAttribute('data-panel', 'true');
  });

  it('keeps the same panel preference on every page that has one', async () => {
    const user = userEvent.setup();
    renderShell('/with-panel');
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));

    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await user.click(await screen.findByRole('link', { name: 'Return' }));

    expect(await screen.findByRole('heading', { name: 'Page with a panel' })).toBeVisible();
    expect(demoPanel()).toBeNull();
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
  });

  it('keeps the page’s panel in ILIAS mode, where the card is ILIAS’s', () => {
    useUiStore.setState({ iliasMode: true });
    renderShell('/with-panel');

    expect(demoPanel()).toBeVisible();
    expect(slot()).toContainElement(demoPanel());
    expect(screen.getByRole('main').closest('.workspace')).toBeNull();
  });

  /**
   * ILIAS mode has no header to bring a hidden panel back from, and the panel
   * holds its only controls. The student's choice is kept for afterwards.
   */
  it('keeps the panel open in ILIAS mode although the student hid panels', () => {
    useUiStore.setState({ iliasMode: true, panelOpen: false });
    renderShell('/with-panel');

    expect(demoPanel()).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).toBeNull();
    expect(useUiStore.getState().panelOpen).toBe(false);
  });

  it('renders in place, always open, when there is no shell around it', () => {
    useUiStore.setState({ panelOpen: false });
    render(
      <SectionPanel label="Alone">
        <PanelHeader title="Standalone" />
      </SectionPanel>,
    );

    const panel = screen.getByRole('complementary', { name: 'Alone' });
    expect(panel).toHaveClass('section-panel');
    expect(within(panel).getByRole('heading', { name: 'Standalone' })).toBeVisible();
  });
});
