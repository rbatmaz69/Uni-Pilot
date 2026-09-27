import { instantiateSvg, nextSvgId } from './svgIds';
import { diagramConfig } from './mermaidTheme';

export type MermaidTheme = 'neutral' | 'dark';
export const NOTE_LAYOUT_EVENT = 'note-layout-change';
export const MAX_DIAGRAM_LENGTH = 50_000;
export const MERMAID_EXAMPLE = 'flowchart TD\n  A[Lecture] --> B[Notes]\n  B --> C[Revision]';

export function isMermaidLanguage(language: unknown) {
  return typeof language === 'string' && language.trim().toLowerCase() === 'mermaid';
}

export function createMermaidBlock(source = MERMAID_EXAMPLE) {
  return {
    type: 'codeBlock',
    attrs: { language: 'mermaid' },
    ...(source ? { content: [{ type: 'text', text: source }] } : {}),
  };
}

let library: Promise<typeof import('mermaid')> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();

/** Mermaid has shared configuration; initialize/render must run as one queued job. */
export function renderMermaid(source: string, theme: MermaidTheme, signal?: AbortSignal) {
  if (source.length > MAX_DIAGRAM_LENGTH) {
    return Promise.reject<string>(
      new Error('This diagram is too large. Use fewer than 50,000 characters.'),
    );
  }
  const key = `${theme}\n${source}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(instantiateSvg(cached));
  const job = queue.then(async () => {
    if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError');
    const reused = cache.get(key);
    if (reused) return instantiateSvg(reused);
    const { default: mermaid } = await (library ??= import('mermaid'));
    // Load the diagram's actual face before Mermaid measures its labels.
    await document.fonts?.load(`13px "JetBrains Mono"`);
    await document.fonts?.ready;
    if (signal?.aborted) throw new DOMException('Rendering cancelled', 'AbortError');
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
    document.body.append(container);
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
        maxTextSize: MAX_DIAGRAM_LENGTH,
        maxEdges: 300,
        ...diagramConfig(theme === 'dark'),
        layout: 'dagre',
        secure: [
          'secure',
          'securityLevel',
          'startOnLoad',
          'maxTextSize',
          'maxEdges',
          'suppressErrorRendering',
          'htmlLabels',
          'fontFamily',
        ],
      });
      const { svg } = await mermaid.render(nextSvgId(), source, container);
      cache.set(key, svg);
      if (cache.size > 24) cache.delete(cache.keys().next().value ?? '');
      return instantiateSvg(svg);
    } finally {
      container.remove();
    }
  });
  // A malformed diagram must not prevent the next diagram from rendering.
  queue = job.catch(() => undefined);
  return job;
}

export function diagramError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return (
    message.replace(/^Error:\s*/i, '').slice(0, 500) || 'Check the diagram syntax and try again.'
  );
}
