import { describe, expect, it } from 'vitest';
import { instantiateSvg } from './svgIds';

describe('diagram SVG references', () => {
  it('also handles repeated IDs emitted within one diagram', () => {
    const host = document.createElement('div');
    host.innerHTML = instantiateSvg(
      '<svg id="root"><defs><marker id="arrow"/><marker id="arrow"/></defs><path marker-end="url(#arrow)"/></svg>',
    );
    const markers = host.querySelectorAll('marker');
    expect(markers[0]!.id).not.toBe(markers[1]!.id);
    expect(host.querySelector('path')!.getAttribute('marker-end')).toBe(`url(#${markers[0]!.id})`);
  });
  it('gives cached diagrams and clones independent IDs while preserving arrows, CSS and accessibility', () => {
    const source =
      '<svg id="diagram" aria-labelledby="title"><style>#diagram{color:#fff} #node{marker-end:url(#arrow)}</style><title id="title">Study flow</title><defs><marker id="arrow" /></defs><path id="node" marker-end="url(&quot;#arrow&quot;)"/><use href="#node"/></svg>';
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.innerHTML = instantiateSvg(source);
    second.innerHTML = instantiateSvg(source);
    const ids = (element: Element) =>
      Array.from(element.querySelectorAll('[id]'), (item) => item.id);
    expect(ids(first).every((id) => !ids(second).includes(id))).toBe(true);
    const marker = first.querySelector('marker')!.id;
    expect(first.querySelector('path')!.getAttribute('marker-end')).toBe(`url(#${marker})`);
    expect(first.querySelector('style')!.textContent).toContain(`url(#${marker})`);
    expect(first.querySelector('style')!.textContent).toContain('color:#fff');
    expect(first.querySelector('use')!.getAttribute('href')).toBe(
      `#${first.querySelector('path')!.id}`,
    );
    expect(first.querySelector('svg')!.getAttribute('aria-labelledby')).toBe(
      first.querySelector('title')!.id,
    );
  });
});
