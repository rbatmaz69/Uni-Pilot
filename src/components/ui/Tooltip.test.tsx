import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

const renderTooltip = (props: { disabled?: boolean } = {}) =>
  render(
    <Tooltip label="Courses" {...props}>
      <button type="button">Open</button>
    </Tooltip>,
  );

const trigger = () => screen.getByRole('button', { name: 'Open' });

describe('Tooltip', () => {
  it('renders its child and stays quiet until asked', () => {
    renderTooltip();

    expect(trigger()).toBeVisible();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('appears on hover and disappears again', async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.hover(trigger());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Courses');

    await user.unhover(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('appears on keyboard focus', async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Courses');
  });

  it('links the trigger to the tooltip while it is open', async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.hover(trigger());

    const tooltip = screen.getByRole('tooltip');
    const anchor = trigger().parentElement;
    expect(anchor).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('stays hidden when disabled', async () => {
    const user = userEvent.setup();
    renderTooltip({ disabled: true });

    await user.hover(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes when the trigger is clicked', async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.hover(trigger());
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.click(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
