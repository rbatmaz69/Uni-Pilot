import type { Annotation, NotebookPage, Point } from '@/features/documents/lib/pdfInkTypes';
import { INK_COLORS } from '@/features/documents/lib/pdfInkTypes';

export function strokePath(points: Point[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y} l 0.01 0`;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const letter of word) {
        if (line && measure(line + letter) > width) {
          lines.push(line);
          line = '';
        }
        line += letter;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** A deterministic line layout shared by SVG, text editing and PDF export. */
export function annotationLines(annotation: Extract<Annotation, { type: 'text' }>): string[] {
  // Canvas and SVG use the same bundled font; width is measured in page points.
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return annotation.text.split('\n');
  context.font = `${annotation.fontSize}px "Instrument Sans Variable", sans-serif`;
  return wrapText(annotation.text, annotation.width, (value) => context.measureText(value).width);
}

export function drawAnnotations(
  context: CanvasRenderingContext2D,
  annotations: Annotation[],
): void {
  for (const annotation of annotations) {
    context.save();
    context.fillStyle = context.strokeStyle = INK_COLORS[annotation.color].hex;
    if (annotation.type === 'highlight') {
      context.globalAlpha = 0.3;
      for (const rect of annotation.rects)
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (annotation.type === 'text') {
      context.font = `${annotation.fontSize}px "Instrument Sans Variable", sans-serif`;
      context.textBaseline = 'top';
      annotationLines(annotation).forEach((line, i) => {
        context.fillText(line, annotation.x, annotation.y + i * annotation.fontSize * 1.35);
      });
    } else {
      context.globalAlpha = annotation.type === 'marker' ? 0.3 : 1;
      context.lineWidth = annotation.width;
      context.lineCap = context.lineJoin = 'round';
      context.beginPath();
      annotation.points.forEach((point, i) => {
        if (i === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      if (annotation.points.length === 1) {
        const point = annotation.points[0]!;
        context.lineTo(point.x + 0.01, point.y);
      }
      context.stroke();
    }
    context.restore();
  }
}

export function annotationImage(page: NotebookPage): string {
  const canvas = document.createElement('canvas');
  // Keep large source sheets within browser canvas limits.
  const scale = Math.min(2, 4096 / Math.max(page.width, page.height));
  canvas.width = Math.ceil(page.width * scale);
  canvas.height = Math.ceil(page.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Dein Gerät unterstützt den PDF-Export nicht.');
  context.scale(scale, scale);
  drawAnnotations(context, page.annotations);
  return canvas.toDataURL('image/png');
}
