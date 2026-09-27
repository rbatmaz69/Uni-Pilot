import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NOTE_LAYOUT_EVENT } from '@/features/documents/lib/mermaid';
import { PageClone } from './NotebookPage';

describe('notebook diagram clones', () => {
  it('refreshes after rendering and gives each clone independent arrow references', () => {
    const flow = document.createElement('div');
    flow.innerHTML =
      '<div class="tiptap"><div class="note-mermaid"><div class="note-mermaid-toolbar"><button>Edit code</button></div><pre class="note-mermaid-code">Source</pre><div class="note-mermaid-preview"></div></div></div>';
    const source = { current: flow };
    const view = render(
      <>
        <PageClone source={source} page={0} pageWidth={400} side="left" />
        <PageClone source={source} page={1} pageWidth={400} side="right" />
      </>,
    );
    flow.querySelector('.note-mermaid-preview')!.innerHTML =
      '<svg id="diagram"><defs><marker id="arrow"/></defs><path marker-end="url(#arrow)"/></svg>';
    fireEvent(
      flow.querySelector('.note-mermaid-preview')!,
      new Event(NOTE_LAYOUT_EVENT, { bubbles: true }),
    );
    const diagrams = view.container.querySelectorAll('svg');
    expect(diagrams).toHaveLength(2);
    expect(diagrams[0]!.id).not.toBe(diagrams[1]!.id);
    for (const diagram of diagrams) {
      expect(diagram.querySelector('path')!.getAttribute('marker-end')).toBe(
        `url(#${diagram.querySelector('marker')!.id})`,
      );
    }
    for (const controls of view.container.querySelectorAll<HTMLElement>(
      '.note-mermaid-toolbar, .note-mermaid-code',
    )) {
      expect(controls.style.visibility).toBe('hidden');
      expect(controls.getAttribute('aria-hidden')).toBe('true');
      expect(controls.hidden).toBe(false);
    }
  });
});
