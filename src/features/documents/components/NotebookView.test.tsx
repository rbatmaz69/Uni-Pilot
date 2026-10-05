import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { NotebookView } from './NotebookView';

function renderNotebook() {
  const user = userEvent.setup();
  render(
    <NotebookView title="Lecture" notePath="Lecture.md" editor={null} flow>
      <div className="tiptap">
        <h1>Limits</h1>
        <p>Every sequence…</p>
      </div>
    </NotebookView>,
  );
  return { user, notebook: screen.getByRole('region', { name: 'Notebook' }) };
}

describe('Notebook view', () => {
  it('offers turning, overview, bookmark, paper and sound in one quiet dock', () => {
    renderNotebook();
    const dock = screen.getByRole('toolbar', { name: 'Notebook controls' });
    expect(within(dock).getByText('Pages 1–2 of 2')).toBeInTheDocument();
    // A single spread has nowhere to turn to.
    expect(within(dock).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(within(dock).getByRole('button', { name: 'Next page' })).toBeDisabled();
    for (const name of ['Page overview', 'Bookmark these pages', 'Paper', 'Sounds'])
      expect(within(dock).getByRole('button', { name })).toBeInTheDocument();
  });

  it('prints the chosen paper and remembers it', async () => {
    const { user, notebook } = renderNotebook();
    expect(notebook).toHaveAttribute('data-paper', 'dotted');
    await user.click(screen.getByRole('button', { name: 'Paper' }));
    const papers = screen.getByRole('radiogroup', { name: 'Paper type' });
    expect(within(papers).getByRole('radio', { name: 'Dotted' })).toBeChecked();
    await user.click(within(papers).getByRole('radio', { name: 'Lined' }));
    expect(notebook).toHaveAttribute('data-paper', 'lined');
    expect(screen.queryByRole('radiogroup', { name: 'Paper type' })).not.toBeInTheDocument();
    expect(useNoteStyleStore.getState().paper).toBe('lined');
  });

  it('closes the paper menu with Escape and returns to its button', async () => {
    const { user } = renderNotebook();
    await user.click(screen.getByRole('button', { name: 'Paper' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('radiogroup', { name: 'Paper type' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paper' })).toHaveFocus();
  });

  it('mutes and unmutes the paper sounds', async () => {
    const { user } = renderNotebook();
    const sounds = screen.getByRole('button', { name: 'Sounds' });
    expect(sounds).toHaveAttribute('aria-pressed', 'true');
    await user.click(sounds);
    expect(sounds).toHaveAttribute('aria-pressed', 'false');
    expect(useNoteStyleStore.getState().sound).toBe(false);
  });

  it('lays every spread out in an overview and returns focus when it closes', async () => {
    const { user } = renderNotebook();
    await user.click(screen.getByRole('button', { name: 'Page overview' }));
    const overview = screen.getByRole('dialog', { name: 'Page overview' });
    const current = within(overview).getByRole('button', { name: /^Pages 1–2/ });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Page overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page overview' })).toHaveFocus();
  });

  it('shows a page thumbnail rail that can be hidden and reopened', async () => {
    const { user } = renderNotebook();
    const rail = screen.getByRole('complementary', { name: 'Document pages' });
    await user.click(within(rail).getByRole('button', { name: 'Hide page thumbnails' }));
    expect(screen.queryByRole('complementary', { name: 'Document pages' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show page thumbnails' }));
    expect(screen.getByRole('complementary', { name: 'Document pages' })).toBeInTheDocument();
  });

  it('writes plain text beside a title page, without pages to turn', () => {
    render(
      <NotebookView title="Shopping" notePath="Shopping.txt" editor={null} flow={false}>
        <textarea aria-label="Document content" defaultValue="matcha" />
      </NotebookView>,
    );
    expect(screen.getByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paper' })).toBeInTheDocument();
  });
});
