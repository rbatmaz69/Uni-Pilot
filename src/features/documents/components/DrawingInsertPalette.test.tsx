import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DrawingInsertPalette } from './DrawingInsertPalette';

it('keeps presets behind three buttons and inserts from their preview pickers', () => {
  const insert = vi.fn();
  render(<DrawingInsertPalette disabled={false} onInsert={insert} />);

  expect(within(screen.getByRole('toolbar')).getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Mint sticky note' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sticky notes' }));
  expect(screen.getByRole('dialog', { name: 'Sticky notes' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mint sticky note' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Shapes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Diamond' }));
  fireEvent.click(screen.getByRole('button', { name: 'Layouts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mind map' }));

  expect(insert.mock.calls).toEqual([['sticky-mint'], ['diamond'], ['mind-map']]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('waits for the drawing canvas before allowing inserts', () => {
  render(<DrawingInsertPalette disabled onInsert={vi.fn()} />);
  for (const name of ['Sticky notes', 'Shapes', 'Layouts'])
    expect(screen.getByRole('button', { name })).toBeDisabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('switches pickers and dismisses on a second click, an outside click, or Escape', () => {
  render(<DrawingInsertPalette disabled={false} onInsert={vi.fn()} />);
  const stickies = screen.getByRole('button', { name: 'Sticky notes' });
  const layouts = screen.getByRole('button', { name: 'Layouts' });
  fireEvent.click(stickies);
  fireEvent.click(layouts);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(stickies).toHaveAttribute('aria-expanded', 'false');
  expect(layouts).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(layouts);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(stickies);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(layouts);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(layouts).toHaveFocus();
});

it('supports keyboard opening, preview navigation, insertion and tab dismissal', async () => {
  const user = userEvent.setup();
  const insert = vi.fn();
  render(<DrawingInsertPalette disabled={false} onInsert={insert} target="note" />);
  const layouts = screen.getByRole('button', { name: 'Layouts' });
  layouts.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('button', { name: 'Study card' })).toHaveFocus();
  await user.keyboard('{ArrowDown}{ArrowRight}');
  expect(screen.getByRole('button', { name: 'Cornell notes' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(insert).toHaveBeenCalledWith('cornell');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.keyboard('{ArrowDown}{End}');
  expect(screen.getByRole('button', { name: 'Mind map' })).toHaveFocus();
  await user.tab();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('removes an open picker when editing becomes unavailable', () => {
  const insert = vi.fn();
  const { rerender } = render(<DrawingInsertPalette disabled={false} onInsert={insert} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sticky notes' }));
  rerender(<DrawingInsertPalette disabled onInsert={insert} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
