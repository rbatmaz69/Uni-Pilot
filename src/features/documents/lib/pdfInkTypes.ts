export type Paper = 'blank' | 'lined' | 'grid';
export type Tool = 'select' | 'pen' | 'marker' | 'text' | 'eraser';
export type InkColor = 'ink' | 'blue' | 'red' | 'green' | 'yellow';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  type: 'pen' | 'marker';
  color: InkColor;
  width: number;
  points: Point[];
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  color: InkColor;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  text: string;
}

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TextHighlight {
  id: string;
  type: 'highlight';
  color: InkColor;
  rects: HighlightRect[];
}
export type Annotation = Stroke | TextAnnotation | TextHighlight;

/** All coordinates are in the displayed page's PDF points, independent of zoom. */
export interface NotebookPage {
  id: string;
  kind: 'source' | 'note';
  sourceIndex: number | null;
  width: number;
  height: number;
  paper: Paper;
  annotations: Annotation[];
}

// Fixed document inks deliberately stay the same on screen and in exported PDFs.
export const INK_COLORS: Record<InkColor, { label: string; hex: string }> = {
  ink: { label: 'Schwarz', hex: '#24313b' },
  blue: { label: 'Blau', hex: '#4258f5' },
  red: { label: 'Rot', hex: '#cf4653' },
  green: { label: 'Grün', hex: '#23816b' },
  yellow: { label: 'Gelb', hex: '#efbf38' },
};

export function translateAnnotation(annotation: Annotation, delta: Point): Annotation {
  if (annotation.type === 'highlight')
    return {
      ...annotation,
      rects: annotation.rects.map((r) => ({ ...r, x: r.x + delta.x, y: r.y + delta.y })),
    };
  return annotation.type === 'text'
    ? { ...annotation, x: annotation.x + delta.x, y: annotation.y + delta.y }
    : {
        ...annotation,
        points: annotation.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
      };
}
