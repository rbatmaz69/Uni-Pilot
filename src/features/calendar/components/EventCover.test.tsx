import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventComposerDialog } from './EventComposerDialog';

describe('Calendar event covers', () => {
  it('saves an uploaded image with the event and allows removing it before saving', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EventComposerDialog
        draft={{ date: '2026-10-07', startTime: '09:00' }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('Title'), 'Exam');
    const file = new File(['image content'], 'cover.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Cover image (optional)'), file);
    const preview = await screen.findByRole('img', { name: 'Event cover preview' });
    const coverImage = preview.getAttribute('src');
    expect(coverImage).toMatch(/^data:image\/png;base64,/);
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ coverImage, date: '2026-10-07' }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove cover' }));
    expect(screen.queryByRole('img', { name: 'Event cover preview' })).toBeNull();
  });

  it('rejects oversized covers', async () => {
    const user = userEvent.setup();
    render(
      <EventComposerDialog
        draft={{ date: '2026-10-07', startTime: '09:00' }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    await user.upload(
      screen.getByLabelText('Cover image (optional)'),
      new File([new Uint8Array(1_000_001)], 'large.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 1 MB');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
