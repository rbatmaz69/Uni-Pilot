import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox, Trash2 } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PanelAction, PanelBody, PanelFooter, PanelHeader, PanelItem, PanelSection } from './Panel';

function renderPanel(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PanelHeader', () => {
  it('shows the title as the panel’s heading', () => {
    render(<PanelHeader title="Mail" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Mail' })).toBeVisible();
  });

  it('puts the actions on the right of the title', () => {
    render(
      <PanelHeader
        title="Mail"
        actions={
          <PanelAction label="Compose">
            <Inbox aria-hidden />
          </PanelAction>
        }
      />,
    );

    const title = screen.getByRole('heading', { name: 'Mail' });
    const action = screen.getByRole('button', { name: 'Compose' });
    expect(title.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lets a switcher take the title’s place, with the heading it brings itself', () => {
    render(
      <PanelHeader
        title="Ignored"
        switcher={
          <h2>
            <button type="button" aria-haspopup="menu">
              Spaces
            </button>
          </h2>
        }
      />,
    );

    expect(screen.getByRole('button', { name: 'Spaces' })).toBeVisible();
    expect(screen.queryByText('Ignored')).toBeNull();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('renders no actions group when there are none', () => {
    const { container } = render(<PanelHeader title="Mail" />);

    expect(container.querySelector('.panel-actions')).toBeNull();
  });
});

describe('PanelAction', () => {
  it('is a button named by its label, which is also its tooltip', async () => {
    const onClick = vi.fn();
    render(
      <PanelAction label="New note" onClick={onClick}>
        <Inbox aria-hidden />
      </PanelAction>,
    );

    const action = screen.getByRole('button', { name: 'New note' });
    expect(action).toHaveAttribute('type', 'button');
    expect(action).toHaveAttribute('title', 'New note');
    await userEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('can be disabled, and can stand for the place being shown', () => {
    render(
      <>
        <PanelAction label="Off" disabled>
          <Inbox aria-hidden />
        </PanelAction>
        <PanelAction label="Overview" aria-current="page">
          <Inbox aria-hidden />
        </PanelAction>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('PanelSection', () => {
  it('names a group by its small heading', () => {
    render(
      <PanelSection heading="Labels">
        <p>Uni</p>
      </PanelSection>,
    );

    const group = screen.getByRole('group', { name: 'Labels' });
    expect(within(group).getByRole('heading', { level: 3, name: 'Labels' })).toBeVisible();
    expect(within(group).getByText('Uni')).toBeVisible();
  });

  it('is only spacing without a heading', () => {
    render(
      <PanelSection>
        <p>Uni</p>
      </PanelSection>,
    );

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Uni')).toBeVisible();
  });

  it('gives every heading its own id', () => {
    render(
      <>
        <PanelSection heading="One">
          <p>a</p>
        </PanelSection>
        <PanelSection heading="Two">
          <p>b</p>
        </PanelSection>
      </>,
    );

    expect(screen.getByRole('group', { name: 'One' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Two' })).toBeVisible();
  });
});

describe('PanelItem as a button', () => {
  it('shows its label and runs its handler', async () => {
    const onClick = vi.fn();
    renderPanel(<PanelItem label="Sent" icon={Inbox} onClick={onClick} />);

    const item = screen.getByRole('button', { name: 'Sent' });
    expect(item).toHaveAttribute('type', 'button');
    await userEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('hides its icon from assistive technology', () => {
    const { container } = renderPanel(<PanelItem label="Sent" icon={Inbox} />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('works without an icon', () => {
    const { container } = renderPanel(<PanelItem label="Uni" />);

    expect(screen.getByRole('button', { name: 'Uni' })).toBeVisible();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('marks the open row with aria-current and the active wash', () => {
    renderPanel(
      <>
        <PanelItem label="Inbox" active />
        <PanelItem label="Sent" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Sent' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Sent' })).not.toHaveClass('is-active');
  });

  it('shows a count badge, which becomes part of its name', () => {
    renderPanel(<PanelItem label="Inbox" count={12} />);

    expect(screen.getByRole('button', { name: 'Inbox 12' })).toBeVisible();
  });

  it('formats a long count and shows nothing for none or zero', () => {
    renderPanel(
      <>
        <PanelItem label="All mail" count={1204} />
        <PanelItem label="Drafts" count={0} />
        <PanelItem label="Spam" />
      </>,
    );

    expect(
      within(screen.getByRole('button', { name: /^All mail/ })).getByText('1,204'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Drafts' })).toHaveTextContent(/^Drafts$/);
    expect(screen.getByRole('button', { name: 'Spam' })).toHaveTextContent(/^Spam$/);
  });

  it('can be disabled and passes other button attributes through', () => {
    renderPanel(<PanelItem label="Trash" disabled title="Not yet" className="custom" />);

    const item = screen.getByRole('button', { name: 'Trash' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Not yet');
    expect(item).toHaveClass('panel-item', 'custom');
  });

  it('can submit when asked to', () => {
    renderPanel(<PanelItem label="Go" type="submit" />);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit');
  });
});

describe('PanelItem as a link', () => {
  it('is a router link to its destination', () => {
    renderPanel(<PanelItem label="Inbox" to="/inbox?folder=inbox" />);

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox?folder=inbox',
    );
    expect(screen.queryByRole('button', { name: 'Inbox' })).toBeNull();
  });

  it('marks the open page with aria-current="page"', () => {
    renderPanel(
      <>
        <PanelItem label="Inbox" to="/inbox" active />
        <PanelItem label="Sent" to="/sent" />
      </>,
    );

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Sent' })).not.toHaveAttribute('aria-current');
  });

  it('shows icon, label and count like a button does', () => {
    const { container } = renderPanel(
      <PanelItem label="Inbox" to="/inbox" icon={Inbox} count={3} />,
    );

    expect(screen.getByRole('link', { name: 'Inbox 3' })).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('navigates and still runs its click handler', async () => {
    const onClick = vi.fn();
    renderPanel(<PanelItem label="Inbox" to="/inbox" onClick={onClick} />);

    await userEvent.click(screen.getByRole('link', { name: 'Inbox' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('PanelBody and PanelFooter', () => {
  it('scrolls the body with the app’s scrollbar', () => {
    render(
      <PanelBody aria-label="Folders">
        <p>rows</p>
      </PanelBody>,
    );

    const body = screen.getByLabelText('Folders');
    expect(body).toHaveClass('panel-body', 'scroll-area');
    expect(within(body).getByText('rows')).toBeVisible();
  });

  it('keeps quiet rows at the foot', () => {
    renderPanel(
      <PanelFooter aria-label="Footer">
        <PanelItem icon={Trash2} label="Recently deleted" />
      </PanelFooter>,
    );

    expect(
      within(screen.getByLabelText('Footer')).getByRole('button', { name: 'Recently deleted' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Footer')).toHaveClass('panel-footer');
  });
});
