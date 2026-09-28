import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { writeDocumentDrag } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import { useUiStore } from '@/store/uiStore';
import { createDataTransfer } from '@/test/dataTransfer';
import { renderApp } from '@/test/render';

const sidebar = () => screen.getByRole('complementary', { name: 'Main navigation' });
const group = (name: string) => within(sidebar()).getByRole('group', { name });
const linkNames = (name: string) =>
  within(group(name))
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));
const row = (name: string) => within(sidebar()).getByRole('link', { name }).closest('li')!;
const biology = { path: 'Biology', name: 'Biology', folder: true };
const lecture = { path: 'Biology/Lecture 1.md', name: 'Lecture 1.md', folder: false };

describe('Sidebar, expanded', () => {
  it('lists every navigation entry with its label visible', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS)) {
      expect(within(sidebar()).getByRole('link', { name: item.label })).toBeVisible();
    }
  });

  it('groups the entries under their section headings', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const section of NAV_SECTIONS) {
      expect(within(sidebar()).getByText(section.label)).toBeVisible();
    }
  });

  it('offers a collapse control and reports the expanded state', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(sidebar()).toHaveAttribute('data-collapsed', 'false');
    expect(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  });
});

describe('Sidebar, collapsed', () => {
  it('collapses when the control is used', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    await user.click(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar()).toHaveAttribute('data-collapsed', 'true');
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it('drops the visible entry labels', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByText(NAV_ITEMS.calendar.label)).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Uni Pilot')).not.toBeInTheDocument();
  });

  it('keeps the section grouping for screen readers', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    for (const section of NAV_SECTIONS) {
      const group = within(sidebar()).getByRole('group', { name: section.label });
      expect(within(group).getByText(section.label)).toHaveClass('sr-only');
    }
  });

  it('keeps every link reachable by name for screen readers', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS)) {
      expect(within(sidebar()).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('moves the toggle into the header', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
  });
});

describe('Sidebar, customizable', () => {
  it('hides an entry from its context menu and brings it back from Customize sidebar', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    fireEvent.contextMenu(within(sidebar()).getByRole('link', { name: 'Grades' }));
    await user.click(
      within(screen.getByRole('menu', { name: 'Grades' })).getByRole('menuitem', {
        name: 'Hide from sidebar',
      }),
    );
    expect(within(sidebar()).queryByRole('link', { name: 'Grades' })).toBeNull();

    fireEvent.contextMenu(within(sidebar()).getByRole('link', { name: 'Calendar' }));
    await user.click(screen.getByRole('menuitem', { name: 'Customize sidebar…' }));
    const dialog = screen.getByRole('dialog', { name: 'Customize sidebar' });
    expect(within(dialog).getByRole('switch', { name: 'Grades' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('switch', { name: 'Grades' }));

    expect(within(sidebar()).getByRole('link', { name: 'Grades' })).toBeInTheDocument();
  });

  it('restores the configured order and every page', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({
      hidden: [NAV_ITEMS.focus.path],
      order: { planning: [NAV_ITEMS.tasks.path, NAV_ITEMS.calendar.path] },
    });
    renderApp(NAV_ITEMS.dashboard.path);
    expect(linkNames('Planning')).toEqual(['Tasks', 'Calendar']);

    fireEvent.contextMenu(within(sidebar()).getByRole('navigation', { name: 'Sections' }));
    await user.click(screen.getByRole('menuitem', { name: 'Customize sidebar…' }));
    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));

    expect(linkNames('Planning')).toEqual(['Calendar', 'Tasks', 'Focus']);
  });

  it('moves entries with Option+arrow keys and from the context menu', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    within(sidebar()).getByRole('link', { name: 'Focus' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(linkNames('Planning')).toEqual(['Calendar', 'Focus', 'Tasks']);

    fireEvent.contextMenu(within(sidebar()).getByRole('link', { name: 'Calendar' }));
    const menu = screen.getByRole('menu', { name: 'Calendar' });
    expect(within(menu).getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    await user.click(within(menu).getByRole('menuitem', { name: 'Move down' }));

    expect(linkNames('Planning')).toEqual(['Focus', 'Calendar', 'Tasks']);
  });

  it('reorders by dragging within a section', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row('Focus'), { dataTransfer });
    fireEvent.dragOver(row('Calendar'), { dataTransfer });
    expect(row('Calendar')).toHaveAttribute('data-drop', 'before');
    fireEvent.drop(row('Calendar'), { dataTransfer });

    expect(linkNames('Planning')).toEqual(['Focus', 'Calendar', 'Tasks']);
  });

  it('does not take entries from another section', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row('Focus'), { dataTransfer });
    fireEvent.dragOver(row('Courses'), { dataTransfer });
    fireEvent.drop(row('Courses'), { dataTransfer });

    expect(row('Courses')).not.toHaveAttribute('data-drop');
    expect(linkNames('Academics')).toEqual(['Courses', 'Exams', 'Grades']);
  });

  it('folds a section from its heading and remembers it', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);
    const heading = within(group('Planning')).getByRole('button', { name: 'Planning' });

    await user.click(heading);

    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar()).queryByRole('link', { name: 'Calendar' })).toBeNull();
    expect(useSidebarStore.getState().collapsedSections).toEqual(['planning']);
  });

  it('shows every entry in the icon-only sidebar, even in folded sections', () => {
    useSidebarStore.setState({ collapsedSections: ['planning'] });
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).getByRole('link', { name: 'Calendar' })).toBeInTheDocument();
  });
});

describe('Sidebar favorites', () => {
  it('invites documents while there are none', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(group('Favorites')).getByText('Drag folders and notes here')).toBeVisible();
  });

  it('keeps a document dropped anywhere on the sidebar', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();
    writeDocumentDrag(dataTransfer, biology);
    const nav = within(sidebar()).getByRole('navigation', { name: 'Sections' });

    fireEvent.dragOver(nav, { dataTransfer });
    expect(within(group('Favorites')).getByText('Drop to add to Favorites')).toBeVisible();
    fireEvent.drop(nav, { dataTransfer });

    const link = within(group('Favorites')).getByRole('link', { name: 'Biology' });
    expect(link).toHaveAttribute('href', NAV_ITEMS.documents.path);
    expect(useSidebarStore.getState().favorites).toEqual([biology]);
  });

  it('drops a document in front of the favorite it lands on', () => {
    useSidebarStore.setState({ favorites: [biology] });
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();
    writeDocumentDrag(dataTransfer, lecture);

    fireEvent.dragOver(row('Biology'), { dataTransfer });
    fireEvent.drop(row('Biology'), { dataTransfer });

    expect(linkNames('Favorites')).toEqual(['Lecture 1', 'Biology']);
  });

  it('reorders and removes favorites', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({ favorites: [biology, lecture] });
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row('Lecture 1'), { dataTransfer });
    fireEvent.dragOver(row('Biology'), { dataTransfer });
    fireEvent.drop(row('Biology'), { dataTransfer });
    expect(linkNames('Favorites')).toEqual(['Lecture 1', 'Biology']);

    fireEvent.contextMenu(within(sidebar()).getByRole('link', { name: 'Biology' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from Favorites' }));
    expect(linkNames('Favorites')).toEqual(['Lecture 1']);
  });

  it('closes its menu on Escape and hands focus back to the favorite', async () => {
    const user = userEvent.setup();
    useSidebarStore.setState({ favorites: [biology] });
    renderApp(NAV_ITEMS.dashboard.path);
    const link = within(sidebar()).getByRole('link', { name: 'Biology' });
    link.focus();

    fireEvent.contextMenu(link);
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Remove from Favorites' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(link).toHaveFocus();
  });

  it('keeps favorites reachable by name in the icon-only sidebar', () => {
    useSidebarStore.setState({ favorites: [lecture] });
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).getByRole('link', { name: 'Lecture 1' })).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Drag folders and notes here')).toBeNull();
  });
});
