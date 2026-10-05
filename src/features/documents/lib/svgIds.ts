let serial = 0;

/** Every mounted SVG (including notebook clones) needs its own reference IDs. */
export function nextSvgId() {
  return `note-diagram-${++serial}`;
}

export function namespaceSvgIds(svg: Element, prefix = nextSvgId()) {
  const ids = new Map<string, string>();
  const elements = [svg, ...svg.querySelectorAll('*')];
  let index = 0;
  for (const element of elements) {
    const id = element.getAttribute('id');
    if (id) {
      const replacement = `${prefix}-${index++}`;
      // Some renderers repeat a definition ID. References should resolve to its
      // first definition, while every element still receives a unique ID.
      if (!ids.has(id)) ids.set(id, replacement);
      element.setAttribute('id', replacement);
    }
  }
  const urls = (value: string) =>
    value.replace(
      /url\(\s*(['"]?)[^#)'"\s]*#([^)'"\s]+)\1\s*\)/g,
      (match, _quote: string, id: string) => (ids.has(id) ? `url(#${ids.get(id)!})` : match),
    );
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'id') continue;
      let value = urls(attribute.value);
      if (attribute.name === 'href' || attribute.name === 'xlink:href') {
        const id = value.startsWith('#') ? ids.get(value.slice(1)) : undefined;
        if (id) value = `#${id}`;
      } else if (attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby') {
        value = value
          .split(/\s+/)
          .map((id) => ids.get(id) ?? id)
          .join(' ');
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
    if (element.localName === 'style') {
      element.textContent = urls(element.textContent ?? '').replace(
        /#([\w-]+)/g,
        (match, id: string) => (ids.has(id) ? `#${ids.get(id)!}` : match),
      );
    }
  }
}

export function instantiateSvg(markup: string) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const svg = template.content.querySelector('svg');
  if (!svg) throw new Error('The diagram could not be displayed.');
  const dimensions = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    dimensions?.length === 4 &&
    dimensions.every(Number.isFinite) &&
    dimensions[2]! > 0 &&
    dimensions[3]! > 0
  ) {
    // Keep small diagrams at their measured size instead of stretching them to page width.
    svg.setAttribute('width', String(dimensions[2]));
    svg.setAttribute('height', String(dimensions[3]));
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  }
  namespaceSvgIds(svg);
  return svg.outerHTML;
}
