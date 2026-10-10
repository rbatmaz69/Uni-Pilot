import { Editor } from '@tiptap/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentEntry } from '@/features/documents/lib/files';
import { noteExtensions } from '@/features/documents/lib/markdown';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { NoteProperties } from './NoteProperties';

const entry: DocumentEntry = {
  name: 'Mitosis.md',
  path: 'Biology/Cells/Mitosis.md',
  folder: false,
  size: 40,
  modified: Date.UTC(2026, 9, 7, 12, 30),
};
const stamp = (milliseconds: number) =>
  new Date(milliseconds).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

let editor: Editor | null = null;
function createEditor(content: string) {
  editor = new Editor({ extensions: noteExtensions(), content, contentType: 'markdown' });
  return editor;
}
function list() {
  return screen.getByRole('region', { name: 'Note properties' });
}
function value(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

beforeEach(() => {
  useNoteStyleStore.setState({ properties: true });
});
afterEach(() => {
  vi.useRealTimers();
  editor?.destroy();
  editor = null;
});

describe('note properties', () => {
  it('lists when it was updated, where it lives and how long it is', () => {
    render(
      <NoteProperties
        entry={entry}
        savedAt={null}
        editor={createEditor('Seven words are written in this note.')}
        text=""
      />,
    );
    expect(
      within(list())
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Last update', 'Location', 'Count']);
    expect(value('Last update')).toHaveTextContent(stamp(entry.modified));
    expect(value('Location')).toHaveTextContent('Documents / Biology / Cells');
    expect(value('Count')).toHaveTextContent('31 characters · 7 words · 1 min read');
  });

  it('shows a save made in this session ahead of the date the file had on opening', () => {
    const savedAt = Date.UTC(2026, 9, 8, 18, 22);
    render(<NoteProperties entry={entry} savedAt={savedAt} editor={null} text="" />);
    expect(value('Last update')).toHaveTextContent(stamp(savedAt));
    expect(value('Last update').querySelector('time')).toHaveAttribute(
      'datetime',
      new Date(savedAt).toISOString(),
    );
  });

  it('shows a dash when nothing says when the note was written', () => {
    render(
      <NoteProperties
        entry={{ ...entry, modified: 0, path: 'Loose.md' }}
        savedAt={null}
        editor={null}
        text=""
      />,
    );
    expect(value('Last update')).toHaveTextContent('—');
    expect(value('Location')).toHaveTextContent(/^Documents$/);
  });

  it('says one character and one word in the singular', () => {
    render(<NoteProperties entry={entry} savedAt={null} editor={null} text="a" />);
    expect(value('Count')).toHaveTextContent('1 character · 1 word · 1 min read');
  });

  it('counts a plain-text note from its text, after a short pause in typing', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <NoteProperties entry={entry} savedAt={null} editor={null} text="one two" />,
    );
    expect(value('Count')).toHaveTextContent('6 characters · 2 words');
    rerender(<NoteProperties entry={entry} savedAt={null} editor={null} text="one two three" />);
    expect(value('Count')).toHaveTextContent('2 words');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(value('Count')).toHaveTextContent('11 characters · 3 words');
  });

  it('counts the editor again once typing pauses, and never on every keystroke', () => {
    vi.useFakeTimers();
    const live = createEditor('One two');
    render(<NoteProperties entry={entry} savedAt={null} editor={live} text="" />);
    expect(value('Count')).toHaveTextContent('6 characters · 2 words');

    act(() => {
      live.commands.insertContentAt(live.state.doc.content.size - 1, ' three');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(value('Count')).toHaveTextContent('2 words');
    act(() => {
      live.commands.insertContentAt(live.state.doc.content.size - 1, ' four');
      vi.advanceTimersByTime(200);
    });
    // The second edit restarted the pause.
    expect(value('Count')).toHaveTextContent('2 words');
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(value('Count')).toHaveTextContent('15 characters · 4 words');
  });

  it('stops listening to the editor and counting when it goes away', () => {
    vi.useFakeTimers();
    const live = createEditor('One');
    const timers = vi.getTimerCount();
    const view = render(<NoteProperties entry={entry} savedAt={null} editor={live} text="" />);
    const off = vi.spyOn(live, 'off');
    expect(vi.getTimerCount()).toBe(timers + 1);
    view.unmount();
    expect(off).toHaveBeenCalledWith('transaction', expect.any(Function));
    // The pause that was still running goes with it.
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('collapses to a "Properties" pill and remembers the choice', async () => {
    const user = userEvent.setup();
    const view = render(
      <NoteProperties entry={entry} savedAt={null} editor={createEditor('Hello')} text="" />,
    );
    const pill = within(list()).getByRole('button', { name: 'Collapse' });
    const rows = value('Count').parentElement!.parentElement!;
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    expect(pill).toHaveAttribute('aria-controls', rows.id);
    expect(rows).toBeVisible();

    await user.click(pill);
    const closed = within(list()).getByRole('button', { name: 'Properties' });
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    expect(rows).not.toBeVisible();
    expect(useNoteStyleStore.getState().properties).toBe(false);
    expect(JSON.parse(localStorage.getItem('uni-pilot.note-style')!)).toMatchObject({
      state: { properties: false },
    });

    // Another note opens the way the last one was left.
    view.unmount();
    render(<NoteProperties entry={entry} savedAt={null} editor={null} text="" />);
    expect(screen.getByRole('button', { name: 'Properties' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Properties' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(value('Count')).toBeVisible();
  });

  it('never changes the note it describes', async () => {
    const user = userEvent.setup();
    const live = createEditor('Keep this exactly');
    const before = live.getMarkdown();
    render(<NoteProperties entry={entry} savedAt={null} editor={live} text="" />);
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    await user.click(screen.getByRole('button', { name: 'Properties' }));
    expect(live.getMarkdown()).toBe(before);
  });
});
