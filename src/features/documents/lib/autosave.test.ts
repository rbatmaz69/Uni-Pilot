import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, type AutosaveState, type SaveOutcome } from './autosave';

let text: string;
let states: AutosaveState[];
const write = vi.fn<(content: string, expected: string) => Promise<SaveOutcome>>();

function saver(disk = 'v0') {
  text = disk;
  return createAutosaver({
    disk,
    baseline: disk,
    read: () => text,
    write,
    onState: (state) => states.push(state),
    delay: 800,
    maxWait: 5000,
  });
}

function type(autosaver: ReturnType<typeof saver>, next: string) {
  text = next;
  autosaver.change();
}

beforeEach(() => {
  vi.useFakeTimers();
  states = [];
  write.mockReset();
  write.mockResolvedValue({ status: 'saved' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('autosave', () => {
  it('waits for a pause in typing and writes the latest text once', async () => {
    const autosaver = saver();
    type(autosaver, 'v1');
    await vi.advanceTimersByTimeAsync(500);
    type(autosaver, 'v2');
    await vi.advanceTimersByTimeAsync(700);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledExactlyOnceWith('v2', 'v0');
    expect(states.at(-1)).toEqual({ kind: 'saved' });
    expect(autosaver.clean).toBe(true);
  });

  it('saves during continuous typing once the maximum wait has passed', async () => {
    const autosaver = saver();
    // A keystroke every 600 ms never leaves the 800 ms pause the debounce waits for.
    for (let keystroke = 0; keystroke < 10; keystroke += 1) {
      type(autosaver, `v${keystroke}`);
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('v8', 'v0');
  });

  it('skips the write when the editor returns to the saved text', async () => {
    const autosaver = saver();
    type(autosaver, 'v1');
    type(autosaver, 'v0');
    await autosaver.flush();
    expect(write).not.toHaveBeenCalled();
    expect(autosaver.clean).toBe(true);
  });

  it('chains saves so each one expects the text written before it', async () => {
    let finish!: () => void;
    write.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ status: 'saved' }))),
    );
    const autosaver = saver();
    type(autosaver, 'v1');
    void autosaver.flush();
    expect(states.at(-1)).toEqual({ kind: 'saving' });
    type(autosaver, 'v2');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenLastCalledWith('v2', 'v1');
    expect(autosaver.clean).toBe(true);
  });

  it('reads the text when the save is requested, not when it runs', async () => {
    const autosaver = saver();
    type(autosaver, 'final words');
    const saved = autosaver.flush();
    text = 'editor already gone';
    await saved;
    expect(write).toHaveBeenCalledWith('final words', 'v0');
  });

  it('keeps edits after a failed save and retries on request', async () => {
    write.mockRejectedValueOnce(new Error('Disk full'));
    const autosaver = saver();
    type(autosaver, 'v1');
    await autosaver.flush();
    expect(states.at(-1)).toEqual({ kind: 'error', message: 'Disk full' });
    expect(autosaver.clean).toBe(false);
    await autosaver.flush();
    expect(write).toHaveBeenLastCalledWith('v1', 'v0');
    expect(states.at(-1)).toEqual({ kind: 'saved' });
  });

  it('stops at a conflict until the user overwrites or reloads', async () => {
    write.mockResolvedValueOnce({ status: 'conflict', disk: 'changed elsewhere' });
    const autosaver = saver();
    type(autosaver, 'mine');
    await autosaver.flush();
    expect(states.at(-1)).toEqual({ kind: 'conflict', disk: 'changed elsewhere' });
    type(autosaver, 'mine, still typing');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
    await autosaver.overwrite();
    expect(write).toHaveBeenLastCalledWith('mine, still typing', 'changed elsewhere');
    expect(autosaver.disk).toBe('mine, still typing');
  });

  it('adopts reloaded disk content as the new saved state', async () => {
    write.mockResolvedValueOnce({ status: 'conflict', disk: 'theirs' });
    const autosaver = saver();
    type(autosaver, 'mine');
    await autosaver.flush();
    text = 'theirs';
    autosaver.reset('theirs', 'theirs');
    expect(states.at(-1)).toEqual({ kind: 'saved' });
    expect(autosaver.clean).toBe(true);
    type(autosaver, 'theirs + more');
    await autosaver.flush();
    expect(write).toHaveBeenLastCalledWith('theirs + more', 'theirs');
  });

  it('stops scheduling after dispose but finishes a final flush', async () => {
    const autosaver = saver();
    type(autosaver, 'v1');
    const last = autosaver.flush();
    autosaver.dispose();
    type(autosaver, 'v2');
    await last;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledExactlyOnceWith('v1', 'v0');
  });
});
