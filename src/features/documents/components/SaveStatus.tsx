import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { AutosaveState } from '@/features/documents/lib/autosave';
import { cn } from '@/lib/utils';

interface SaveStatusProps {
  state: AutosaveState;
  savedLabel: string;
  onRetry: () => void;
  onResolve?: () => void;
}

/**
 * Autosave feedback. Routine states stay quiet for screen readers — hearing
 * "Saving…" after every pause in typing is noise — while failures are
 * announced, because they are the only states that need the user.
 */
export function SaveStatus({ state, savedLabel, onRetry, onResolve }: SaveStatusProps) {
  if (state.kind === 'error' || state.kind === 'conflict')
    return (
      <span role="alert" className="save-status is-problem">
        <TriangleAlert size={12} aria-hidden />
        {state.kind === 'error' ? `Not saved: ${state.message}` : 'Changed in another app'}
        <button
          type="button"
          className="save-status-action"
          onClick={state.kind === 'error' ? onRetry : onResolve}
        >
          {state.kind === 'error' ? 'Retry' : 'Resolve…'}
        </button>
      </span>
    );
  return (
    <span className={cn('save-status', state.kind === 'saved' && 'is-saved')}>
      {state.kind === 'saved' ? (
        <Check size={12} aria-hidden />
      ) : state.kind === 'saving' ? (
        <LoaderCircle size={12} className="animate-spin" aria-hidden />
      ) : null}
      {state.kind === 'saved'
        ? savedLabel
        : state.kind === 'saving'
          ? 'Saving…'
          : 'Unsaved changes'}
    </span>
  );
}
