/** What the disk reported for one save attempt. */
export type SaveOutcome = { status: 'saved' } | { status: 'conflict'; disk: string };

export type AutosaveState =
  | { kind: 'saved' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; disk: string };

interface AutosaverOptions {
  /** The file's content as last read from or written to disk. */
  disk: string;
  /** What the editor serialises for `disk`; writing it back would change nothing. */
  baseline: string;
  /** Serialises the editor. Called synchronously whenever a save is taken. */
  read: () => string;
  /** Writes `content` if the file still holds `expected`. */
  write: (content: string, expected: string) => Promise<SaveOutcome>;
  onState: (state: AutosaveState) => void;
  /** Quiet time after the last edit before saving, in ms. */
  delay?: number;
  /** Longest an edit may stay unsaved while typing continues, in ms. */
  maxWait?: number;
}

export interface Autosaver {
  /** Records an edit and schedules a save. */
  change(): void;
  /** Saves now. Resolves once this and every earlier save has finished. */
  flush(): Promise<void>;
  /** Resolves a conflict by writing the editor's content over the disk version. */
  overwrite(): Promise<void>;
  /** Adopts content loaded from disk, e.g. after an external change or a reload. */
  reset(disk: string, baseline: string): void;
  /** True when nothing is waiting to be written and no conflict is open. */
  readonly clean: boolean;
  readonly disk: string;
  /** Stops scheduling. Saves already taken still finish. */
  dispose(): void;
}

/**
 * Debounced, strictly sequential saving with compare-and-swap semantics.
 *
 * Saves run one at a time because each passes the previous save's content as
 * `expected`; two in flight would conflict with each other. The content is
 * read when a save is *taken*, not when it runs, so a save requested while the
 * editor unmounts still writes the final text.
 */
export function createAutosaver({
  read,
  write,
  onState,
  delay = 800,
  maxWait = 5000,
  ...initial
}: AutosaverOptions): Autosaver {
  let disk = initial.disk;
  let baseline: string | null = initial.baseline;
  let edits = 0;
  let persisted = 0;
  let firstUnsavedAt: number | null = null;
  let saving = 0;
  let error: string | null = null;
  let conflict: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  let disposed = false;
  let published = JSON.stringify({ kind: 'saved' });

  function current(): AutosaveState {
    if (conflict !== null) return { kind: 'conflict', disk: conflict };
    if (saving) return { kind: 'saving' };
    if (edits === persisted) return { kind: 'saved' };
    return error === null ? { kind: 'pending' } : { kind: 'error', message: error };
  }

  function publish() {
    const state = current();
    const serialized = JSON.stringify(state);
    if (serialized === published) return;
    published = serialized;
    onState(state);
  }

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (disposed || conflict !== null) return;
    firstUnsavedAt ??= Date.now();
    const wait = Math.min(delay, Math.max(0, firstUnsavedAt + maxWait - Date.now()));
    timer = setTimeout(() => void flush(), wait);
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (conflict !== null || edits === persisted) return queue;
    const covers = edits;
    const content = read();
    saving += 1;
    publish();
    queue = queue.then(async () => {
      try {
        if (conflict !== null) return;
        if (content !== baseline) {
          const outcome = await write(content, disk);
          if (outcome.status === 'conflict') {
            conflict = outcome.disk;
            return;
          }
          disk = content;
          baseline = content;
        }
        persisted = Math.max(persisted, covers);
        error = null;
        if (persisted === edits) firstUnsavedAt = null;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      } finally {
        saving -= 1;
        // Edits made while this save ran need one of their own.
        if (!saving && edits !== persisted && conflict === null && error === null) schedule();
        publish();
      }
    });
    return queue;
  }

  return {
    change() {
      edits += 1;
      schedule();
      publish();
    },
    flush,
    overwrite() {
      if (conflict === null) return queue;
      disk = conflict;
      // Unknown until written: never skip this save as a no-op.
      baseline = null;
      conflict = null;
      return flush();
    },
    reset(nextDisk, nextBaseline) {
      clearTimeout(timer);
      timer = undefined;
      disk = nextDisk;
      baseline = nextBaseline;
      conflict = null;
      error = null;
      persisted = edits;
      firstUnsavedAt = null;
      publish();
    },
    get clean() {
      return edits === persisted && saving === 0 && conflict === null;
    },
    get disk() {
      return disk;
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
