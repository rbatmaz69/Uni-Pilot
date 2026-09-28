import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventComposerDialog } from './EventComposerDialog';

const draft = { date: '2026-10-07', startTime: '09:00' };

const openComposer = (props: Partial<Parameters<typeof EventComposerDialog>[0]> = {}) => {
  const onSubmit = vi.fn();
  const onSubmitTask = vi.fn();
  const onClose = vi.fn();
  render(
    <EventComposerDialog
      draft={draft}
      onClose={onClose}
      onSubmit={onSubmit}
      onSubmitTask={onSubmitTask}
      {...props}
    />,
  );
  return { onSubmit, onSubmitTask, onClose };
};

describe('Calendar quick composer', () => {
  it('names the dialog even though the heading is only for assistive tech', () => {
    openComposer();

    expect(screen.getByRole('dialog', { name: 'New event' })).toBeVisible();
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });

  it('files a task rather than an event once the Task tab is chosen', async () => {
    const user = userEvent.setup();
    const { onSubmit, onSubmitTask, onClose } = openComposer();

    await user.click(screen.getByRole('button', { name: 'Task' }));
    await user.type(screen.getByLabelText('Title'), 'Hand in the lab report');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.type(screen.getByLabelText('Course code'), 'inf201');
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(onSubmitTask).toHaveBeenCalledWith({
      title: 'Hand in the lab report',
      dueDate: draft.date,
      dueTime: null,
      priority: 'high',
      courseCode: 'INF201',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('drops the rows an event owns while the Task tab is open', async () => {
    const user = userEvent.setup();
    openComposer();

    await user.click(screen.getByRole('button', { name: 'Task' }));

    expect(screen.queryByLabelText('Type')).toBeNull();
    expect(screen.queryByLabelText('Location')).toBeNull();
    expect(screen.queryByLabelText('Cover image (optional)')).toBeNull();
    expect(screen.getByLabelText('Due date')).toHaveValue(draft.date);
  });

  it('asks for a name before filing a task', async () => {
    const user = userEvent.setup();
    const { onSubmitTask } = openComposer();

    await user.click(screen.getByRole('button', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the task a name');
    expect(onSubmitTask).not.toHaveBeenCalled();
  });

  it('hides the Task tab where there is nowhere to file a task', () => {
    render(<EventComposerDialog draft={draft} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'What to add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Task' })).toBeNull();
  });

  it('keeps a description with the event', async () => {
    const user = userEvent.setup();
    const { onSubmit } = openComposer();

    await user.type(screen.getByLabelText('Title'), 'Thesis kick-off');
    await user.type(screen.getByLabelText('Description'), 'Bring the outline');
    await user.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Thesis kick-off', note: 'Bring the outline' }),
    );
  });

  it('saves on the shortcut, so Enter stays free for the description', async () => {
    const user = userEvent.setup();
    const { onSubmit } = openComposer();

    await user.type(screen.getByLabelText('Title'), 'Reading group');
    await user.type(screen.getByLabelText('Description'), 'First chapter{Enter}Second chapter');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'First chapter\nSecond chapter' }),
    );
  });

  it('folds the reminder row away until there is a reminder to show', async () => {
    const user = userEvent.setup();
    openComposer();

    const row = screen.getByRole('button', { name: 'Add a reminder' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Reminders' })).toBeNull();

    await user.click(row);

    expect(screen.getByRole('checkbox', { name: 'Reminders' })).toBeVisible();
  });

  it('opens the reminder row by itself for a kind that reminds by default', async () => {
    const user = userEvent.setup();
    openComposer();

    await user.selectOptions(screen.getByLabelText('Type'), 'deadline');

    expect(screen.getByRole('button', { name: '3 days, 1 day, 2 hours before' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Reminders' })).toBeChecked();
  });
});
