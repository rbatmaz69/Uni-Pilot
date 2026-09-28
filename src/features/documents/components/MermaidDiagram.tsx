import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, Network } from 'lucide-react';
import {
  diagramError,
  NOTE_LAYOUT_EVENT,
  renderMermaid,
  type MermaidTheme,
} from '@/features/documents/lib/mermaid';

type Result = { source: string; theme: MermaidTheme; svg: string | null; error: string | null };

/** Shared by the live editor and read-only note previews. SVG is never saved in the note. */
export function MermaidDiagram({
  source,
  theme = 'neutral',
}: {
  source: string;
  theme?: MermaidTheme;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const empty = !source.trim();
  const pending = !empty && (result?.source !== source || result?.theme !== theme);
  const error = !pending && !empty ? result?.error : null;
  const svg = empty ? null : result?.svg;

  useEffect(() => {
    if (!source.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void renderMermaid(source, theme, controller.signal).then(
        (svg) => {
          if (!controller.signal.aborted) setResult({ source, theme, svg, error: null });
        },
        (cause: unknown) => {
          if (!controller.signal.aborted)
            setResult((previous) => ({
              source,
              theme,
              svg: previous?.svg ?? null,
              error: diagramError(cause),
            }));
        },
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, theme]);

  useLayoutEffect(() => {
    root.current?.dispatchEvent(new Event(NOTE_LAYOUT_EVENT, { bubbles: true }));
  }, [svg, error, empty]);

  return (
    <div
      ref={root}
      className="note-mermaid-preview"
      contentEditable={false}
      data-diagram-theme={theme}
    >
      {svg ? (
        <div
          className="note-mermaid-svg"
          role="img"
          aria-label={
            error || pending ? 'Mermaid diagram — preview of previous code' : 'Mermaid diagram'
          }
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="note-mermaid-placeholder">
          {pending ? (
            <LoaderCircle size={22} className="note-mermaid-loading" />
          ) : (
            <Network size={24} />
          )}
          <span>
            {empty
              ? 'Write or paste Mermaid code to create a diagram.'
              : pending
                ? 'Rendering diagram…'
                : 'Your diagram will appear here.'}
          </span>
        </div>
      )}
      <div className="note-mermaid-status" role="status" aria-live="polite">
        {error ? (
          <p className="note-mermaid-error">
            <AlertCircle size={15} />
            <span>
              {svg ? 'Preview is out of date. ' : ''}
              {error}
            </span>
          </p>
        ) : pending && svg ? (
          <span>Updating diagram…</span>
        ) : null}
      </div>
    </div>
  );
}
