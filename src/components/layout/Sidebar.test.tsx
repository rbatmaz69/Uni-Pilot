import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { writeDocumentDrag } from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';
import { createDataTransfer } from '@/test/dataTransfer';
import { renderApp } from '@/test/render';
import { Sidebar } from './Sidebar';

const sidebar = () => screen.getByRole('complementary', { name: 'Main navigation' });
const group = (name: string) => within(sidebar()).getByRole('group', { name });
const linkNames = (name: string) =>
  within(group(name))
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));
const row = (name: string) => within(sidebar()).getByRole('link', { name }).closest('li')!;
const biology = { path: 'Biology', name: 'Biology', folder: true };
const lecture = { path: 'Biology/Lecture 1.md', name: 'Lecture 1.md', folder: false };

/** The sidebar on its own, for what does not need a page beside it. */
function renderSidebar(path: string = NAV_ITEMS.dashboard.path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar, the icon rail', () => {
  it('links every page by name, Settings included', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS))
      expect(within(sidebar()).getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.path,
      );
  });

  it('shows icons only: no labels, no section headings, no semester card', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS))
      expect(within(sidebar()).queryByText(item.label)).not.toBeInTheDocument();
    for (const section of NAV_SECTIONS)
      expect(within(group(section.label)).getByText(section.label)).toHaveClass('sr-only');
    expect(within(sidebar()).queryByText('Uni Pilot')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Your semester')).not.toBeInTheDocument();
  });

  it('has nothing left to collapse, fold or toggle', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: 'Toggle color theme' })).toBeNull();
    // Section headings name their group but are no longer buttons that fold it.
    expect(within(sidebar()).queryByRole('button', { name: 'Planning' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
  });

  it('names each entry in a tooltip', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.hover(within(sidebar()).getByRole('link', { name: 'Calendar' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Calendar');
    await user.hover(within(sidebar()).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Settings');
  });

  it('opens a page from its icon and marks the open one', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(sidebar()).getByRole('link', { name: 'Calendar' }));

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeVisible();
    expect(within(sidebar()).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('opens the profile from the avatar, with the student named in a tooltip', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    const profile = within(sidebar()).getByRole('button', { name: 'Open profile for Alex' });
    await user.hover(profile);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Alex Morgan');
    await user.click(profile);

    // The page is named once, by its h1; the Settings panel's own title is an h2 beside it.
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Settings' })).toBeVisible();
  });

  it('lights up the favorite the Documents page shows instead of Documents', () => {
    useSidebarStore.setState({ favorites: [biology, lecture], activeDocument: biology.path });
    renderSidebar(NAV_ITEMS.documents.path);

    expect(within(sidebar()).getByRole('link', { name: 'Biology' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Lecture 1' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Documents' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps Documents lit while the page shows something that is no favorite', () => {
    useSidebarStore.setState({ favorites: [biology], activeDocument: 'Chemistry' });
    renderSidebar(NAV_ITEMS.documents.path);

    expect(within(sidebar()).getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Biology' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps a favorite lit only on the Documents page', () => {
    useSidebarStore.setState({ favorites: [biology], activeDocument: biology.path });
    renderSidebar(NAV_ITEMS.calendar.path);

    expect(within(sidebar()).getByRole('link', { name: 'Biology' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  it('hides an entry from Customize sidebar, in the dialog the empty rail also opens', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    fireEvent.contextMenu(within(sidebar()).getByRole('navigation', { name: 'Sections' }));
    await user.click(screen.getByRole('menuitem', { name: 'Customize sidebar…' }));
    const dialog = screen.getByRole('dialog', { name: 'Customize sidebar' });
    await user.click(within(dialog).getByRole('switch', { name: 'Exams' }));

    expect(within(sidebar()).queryByRole('link', { name: 'Exams' })).toBeNull();
    expect(useSidebarStore.getState().hidden).toEqual([NAV_ITEMS.exams.path]);
    expect(linkNames('Academics')).toEqual(['ILIAS', 'Grades']);
  });

  it('shows the entries in the student order and leaves hidden ones out', () => {
    useSidebarStore.setState({
      hidden: [NAV_ITEMS.focus.path],
      order: { planning: [NAV_ITEMS.tasks.path, NAV_ITEMS.calendar.path] },
    });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(linkNames('Planning')).toEqual(['Tasks', 'Calendar']);
  });

  it('drops a section with nothing left in it', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    for (const label of ['Calendar', 'Tasks', 'Focus']) {
      fireEvent.contextMenu(within(sidebar()).getByRole('link', { name: label }));
      await user.click(screen.getByRole('menuitem', { name: 'Hide from sidebar' }));
    }

    expect(within(sidebar()).queryByRole('group', { name: 'Planning' })).toBeNull();
    expect(within(sidebar()).getByRole('group', { name: 'Academics' })).toBeInTheDocument();
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
    fireEvent.dragOver(row('ILIAS'), { dataTransfer });
    fireEvent.drop(row('ILIAS'), { dataTransfer });

    expect(row('ILIAS')).not.toHaveAttribute('data-drop');
    expect(linkNames('Academics')).toEqual(['ILIAS', 'Exams', 'Grades']);
  });
});

describe('Sidebar favorites', () => {
  it('shows no Favorites while there are none and nothing is on its way', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByRole('group', { name: 'Favorites' })).toBeNull();
  });

  it('shows favorites as icons, named by their links', () => {
    useSidebarStore.setState({ favorites: [lecture] });
    renderSidebar();

    expect(within(sidebar()).getByRole('link', { name: 'Lecture 1' })).toHaveAttribute(
      'href',
      `${NAV_ITEMS.documents.path}?path=Biology&file=Biology%2FLecture+1.md`,
    );
    expect(within(sidebar()).queryByText('Lecture 1')).not.toBeInTheDocument();
  });

  it('keeps a document dropped anywhere on the sidebar', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();
    writeDocumentDrag(dataTransfer, biology);
    const nav = within(sidebar()).getByRole('navigation', { name: 'Sections' });

    fireEvent.dragOver(nav, { dataTransfer });
    expect(group('Favorites')).toHaveAttribute('data-over');
    expect(within(group('Favorites')).getByText('Drop to add to Favorites')).toBeInTheDocument();
    fireEvent.drop(nav, { dataTransfer });

    const link = within(group('Favorites')).getByRole('link', { name: 'Biology' });
    expect(link).toHaveAttribute('href', `${NAV_ITEMS.documents.path}?path=Biology`);
    expect(useSidebarStore.getState().favorites).toEqual([biology]);
  });

  it('adds to the end of the existing favorites', () => {
    useSidebarStore.setState({ favorites: [lecture] });
    renderSidebar();
    const dataTransfer = createDataTransfer();
    writeDocumentDrag(dataTransfer, biology);
    const nav = within(sidebar()).getByRole('navigation', { name: 'Sections' });

    fireEvent.dragOver(nav, { dataTransfer });
    expect(group('Favorites')).toHaveAttribute('data-over');
    fireEvent.drop(nav, { dataTransfer });

    expect(useSidebarStore.getState().favorites).toEqual([lecture, biology]);
    expect(within(sidebar()).getByRole('link', { name: 'Biology' })).toBeInTheDocument();
  });

  it('ignores something that is no document being dragged over it', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const dataTransfer = createDataTransfer();
    dataTransfer.setData('text/plain', 'hello');
    const nav = within(sidebar()).getByRole('navigation', { name: 'Sections' });

    fireEvent.dragOver(nav, { dataTransfer });
    fireEvent.drop(nav, { dataTransfer });

    expect(within(sidebar()).queryByRole('group', { name: 'Favorites' })).toBeNull();
    expect(useSidebarStore.getState().favorites).toEqual([]);
  });

  it('offers itself while a document is dragged anywhere in the app', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    act(() => useSidebarStore.getState().setDocumentDrag(biology));
    expect(within(group('Favorites')).getByText('Drop to add to Favorites')).toBeInTheDocument();

    act(() => useSidebarStore.getState().setDocumentDrag(null));
    expect(within(sidebar()).queryByRole('group', { name: 'Favorites' })).toBeNull();
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
});
