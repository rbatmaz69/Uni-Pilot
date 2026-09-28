import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotebookPageRail } from './NotebookPageRail';

describe('Notebook page thumbnails', () => {
  it('lists every page and navigates to the spread containing the chosen page', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <NotebookPageRail
        source={createRef<HTMLDivElement>()}
        editor={null}
        pages={6}
        currentSpread={1}
        size={{ width: 800, height: 530 }}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );

    const rail = screen.getByRole('complementary', { name: 'Document pages' });
    const thumbnails = within(rail).getByRole('navigation', { name: 'Page thumbnails' });
    expect(within(thumbnails).getAllByRole('button')).toHaveLength(6);
    expect(within(thumbnails).getByRole('button', { name: 'Go to page 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(thumbnails).getByRole('button', { name: 'Go to page 6' }));
    expect(onPick).toHaveBeenCalledWith(2);
  });
});
