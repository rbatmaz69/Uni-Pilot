import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { annotationLines, strokePath } from '@/features/documents/lib/pdfInk';
import { translateAnnotation } from '@/features/documents/lib/pdfInkTypes';
import { INK_COLORS } from '@/features/documents/lib/pdfInkTypes';
import type {
  Annotation,
  InkColor,
  NotebookPage,
  Point,
  Stroke,
  TextAnnotation,
  Tool,
} from '@/features/documents/lib/pdfInkTypes';

interface Props {
  page: NotebookPage;
  tool: Tool;
  color: InkColor;
  penWidth: number;
  textSize: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (annotations: Annotation[]) => void;
  onText: (annotation: TextAnnotation) => void;
}

type DrawingEvent = PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>;
function pointerId(event: DrawingEvent): number {
  return 'pointerId' in event ? event.pointerId : 1;
}

export function PdfInkLayer({
  page,
  tool,
  color,
  penWidth,
  textSize,
  selected,
  onSelect,
  onChange,
  onText,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    pointer: number;
    stroke?: Stroke;
    origin?: Point;
    annotation?: Annotation;
  } | null>(null);
  const [preview, setPreview] = useState<Annotation | null>(null);
  const draft = useRef<Annotation | null>(null);
  const paint = useRef(0);
  useEffect(() => () => cancelAnimationFrame(paint.current), []);
  function previewFrame(annotation: Annotation) {
    draft.current = annotation;
    if (paint.current) return;
    paint.current = requestAnimationFrame(() => {
      paint.current = 0;
      const current = draft.current;
      setPreview(
        current && (current.type === 'pen' || current.type === 'marker')
          ? { ...current, points: [...current.points] }
          : current,
      );
    });
  }

  function point(event: DrawingEvent): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(page.width, ((event.clientX - rect.left) / rect.width) * page.width)),
      y: Math.max(
        0,
        Math.min(page.height, ((event.clientY - rect.top) / rect.height) * page.height),
      ),
    };
  }

  function hit(event: DrawingEvent): Annotation | undefined {
    const id = (event.target as Element)
      .closest('[data-annotation]')
      ?.getAttribute('data-annotation');
    return page.annotations.find((annotation) => annotation.id === id);
  }

  function start(event: DrawingEvent, clicked = false) {
    if (event.button !== 0 || gesture.current) return;
    const position = point(event);
    const annotation = hit(event);
    if (tool === 'text') {
      if (!clicked) return;
      const text: TextAnnotation =
        annotation?.type === 'text'
          ? annotation
          : {
              id: crypto.randomUUID(),
              type: 'text',
              color,
              x: Math.min(position.x, page.width - 60),
              y: Math.min(position.y, page.height - textSize * 2),
              width: Math.min(260, Math.max(60, page.width - position.x - 12)),
              fontSize: textSize,
              text: '',
            };
      onText(text);
      return;
    }
    if (tool === 'eraser') {
      if (annotation) onChange(page.annotations.filter((item) => item.id !== annotation.id));
      return;
    }
    if (tool === 'select') {
      onSelect(annotation?.id ?? null);
      if (!annotation) return;
      gesture.current = { pointer: pointerId(event), origin: position, annotation };
    } else {
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        type: tool,
        color,
        width: tool === 'marker' ? penWidth * 6 : penWidth,
        points: [position],
      };
      gesture.current = { pointer: pointerId(event), stroke };
      setPreview(stroke);
    }
    event.preventDefault();
    if ('pointerId' in event) event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function move(event: DrawingEvent) {
    const current = gesture.current;
    if (!current || current.pointer !== pointerId(event)) return;
    const position = point(event);
    if (current.stroke) {
      const last = current.stroke.points.at(-1)!;
      if (Math.hypot(last.x - position.x, last.y - position.y) < 0.5) return;
      current.stroke.points.push(position);
      previewFrame(current.stroke);
    } else if (current.annotation && current.origin) {
      previewFrame(
        translateAnnotation(current.annotation, {
          x: position.x - current.origin.x,
          y: position.y - current.origin.y,
        }),
      );
    }
  }

  function finish(event: DrawingEvent, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointer !== pointerId(event)) return;
    if (!cancelled) {
      if (current.stroke) {
        const end = point(event);
        const last = current.stroke.points.at(-1)!;
        if (Math.hypot(last.x - end.x, last.y - end.y) >= 0.5) current.stroke.points.push(end);
        onChange([...page.annotations, current.stroke]);
      } else if (current.annotation && current.origin) {
        const end = point(event);
        const moved = translateAnnotation(current.annotation, {
          x: end.x - current.origin.x,
          y: end.y - current.origin.y,
        });
        if (end.x !== current.origin.x || end.y !== current.origin.y)
          onChange(page.annotations.map((item) => (item.id === moved.id ? moved : item)));
      }
    }
    gesture.current = null;
    cancelAnimationFrame(paint.current);
    paint.current = 0;
    draft.current = null;
    setPreview(null);
    if ('pointerId' in event && event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const annotations = page.annotations.map((item) => (preview?.id === item.id ? preview : item));
  if (preview && !page.annotations.some((item) => item.id === preview.id))
    annotations.push(preview);
  return (
    <svg
      ref={svgRef}
      className={`document-annotations document-tool-${tool}`}
      viewBox={`0 0 ${page.width} ${page.height}`}
      role="img"
      aria-label="Zeichenfläche: Stift und Marker ziehen, Text durch Klicken einfügen"
      onClick={(event) => {
        if (tool === 'text') start(event, true);
      }}
      onPointerDown={(event) => start(event)}
      onPointerMove={move}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onMouseDown={(event) => {
        if (!window.PointerEvent) start(event);
      }}
      onMouseMove={(event) => {
        if (!window.PointerEvent) move(event);
      }}
      onMouseUp={(event) => {
        if (!window.PointerEvent) finish(event);
      }}
      onMouseLeave={(event) => {
        if (!window.PointerEvent) finish(event);
      }}
    >
      {annotations.map((annotation) => {
        const lines = annotation.type === 'text' ? annotationLines(annotation) : [];
        return (
          <g
            key={annotation.id}
            data-annotation={annotation.id}
            onDoubleClick={() => {
              if (tool === 'select' && annotation.type === 'text') onText(annotation);
            }}
          >
            {annotation.type === 'highlight' ? (
              <g className="document-text-highlight">
                {annotation.rects.map((rect, index) => (
                  <rect
                    key={index}
                    {...rect}
                    fill={INK_COLORS[annotation.color].hex}
                    opacity="0.3"
                    stroke={selected === annotation.id ? INK_COLORS.blue.hex : 'none'}
                    strokeWidth="1"
                  />
                ))}
              </g>
            ) : annotation.type === 'text' ? (
              <>
                <rect
                  x={annotation.x - 3}
                  y={annotation.y - 3}
                  width={annotation.width + 6}
                  height={Math.max(1, lines.length) * annotation.fontSize * 1.35 + 6}
                  fill="transparent"
                  stroke={selected === annotation.id ? INK_COLORS.blue.hex : 'none'}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                <text
                  fill={INK_COLORS[annotation.color].hex}
                  fontSize={annotation.fontSize}
                  dominantBaseline="text-before-edge"
                  className="document-annotation-text"
                >
                  {lines.map((line, index) => (
                    <tspan
                      key={index}
                      x={annotation.x}
                      y={annotation.y + index * annotation.fontSize * 1.35}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </>
            ) : (
              <>
                {selected === annotation.id ? (
                  <path
                    d={strokePath(annotation.points)}
                    fill="none"
                    stroke={INK_COLORS.blue.hex}
                    strokeWidth={annotation.width + 4}
                    opacity="0.2"
                    strokeLinecap="round"
                  />
                ) : null}
                <path
                  d={strokePath(annotation.points)}
                  fill="none"
                  stroke={INK_COLORS[annotation.color].hex}
                  strokeWidth={annotation.width}
                  opacity={annotation.type === 'marker' ? 0.3 : 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={strokePath(annotation.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(12, annotation.width)}
                  strokeLinecap="round"
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function TextEditor({
  annotation,
  scale,
  onCommit,
  onCancel,
}: {
  annotation: TextAnnotation;
  scale: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(annotation.text);
  const completed = useRef(false);
  function commit() {
    if (!completed.current) {
      completed.current = true;
      onCommit(text);
    }
  }
  return (
    <textarea
      autoFocus
      aria-label="Text auf der Seite"
      className="document-text-editor"
      style={{
        left: annotation.x * scale,
        top: annotation.y * scale,
        width: annotation.width * scale,
        fontSize: annotation.fontSize * scale,
        color: INK_COLORS[annotation.color].hex,
        height:
          Math.max(1, annotationLines({ ...annotation, text }).length) *
          annotation.fontSize *
          1.35 *
          scale,
      }}
      maxLength={20000}
      rows={1}
      spellCheck
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          completed.current = true;
          onCancel();
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
