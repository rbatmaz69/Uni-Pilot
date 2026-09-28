import {
  Fragment,
  memo,
  createElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { resolveNoteLink } from '@/features/documents/lib/attachments';
import { noteExtensions, splitFrontMatter } from '@/features/documents/lib/markdown';
import { loadAttachment } from '@/features/documents/lib/previewCache';
import { noteTitle } from '@/features/documents/lib/noteTitle';
import { slicePreviewText } from '@/features/documents/lib/previewText';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import type { PreviewSize } from '@/features/documents/lib/folderLayout';
import { cn } from '@/lib/utils';
import { isMermaidLanguage } from '@/features/documents/lib/mermaid';
import { MermaidDiagram } from './MermaidDiagram';

const parser = new MarkdownManager({ extensions: noteExtensions() });
const parsed = new Map<string, JSONContent>();

// A thumbnail only shows the first page. Do not build thousands of invisible
// table cells and paragraphs from the rest of a long note.
function firstPage(document: JSONContent): JSONContent {
  let remaining = 120;
  const trim = (node: JSONContent): JSONContent => {
    remaining -= 1;
    if (!node.content) return node;
    const content: JSONContent[] = [];
    for (const child of node.content) {
      if (remaining <= 0) break;
      content.push(trim(child));
    }
    return { ...node, content };
  };
  return trim(document);
}

function parsePreview(source: string, plain: boolean): JSONContent {
  const content = slicePreviewText(source, 8000);
  const asPlainText = () => ({
    type: 'doc',
    content: content.split(/\r?\n/).map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  });
  if (plain) {
    return firstPage(asPlainText());
  }
  const cached = parsed.get(content);
  if (cached) return cached;
  let document: JSONContent;
  try {
    document = parser.parse(splitFrontMatter(content).body);
  } catch {
    // A malformed note should still leave the canvas usable.
    document = asPlainText();
  }
  document = firstPage(document);
  parsed.set(content, document);
  if (parsed.size > 32) parsed.delete(parsed.keys().next().value ?? '');
  return document;
}

function NoteVisualImage({ notePath, src, alt }: { notePath: string; src: string; alt: string }) {
  const path = resolveNoteLink(notePath, src);
  const [url, setUrl] = useState<string | null>(src.startsWith('data:image/') ? src : null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    loadAttachment(path).then(
      (data) => {
        if (active) setUrl(`data:${data.mime};base64,${data.base64}`);
      },
      () => {
        if (active) setUrl(null);
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <span className="note-visual-image">
      {url ? <img src={url} alt={alt} draggable={false} /> : <span>{alt || 'Image'}</span>}
    </span>
  );
}

function renderNode(node: JSONContent, notePath: string, key: number): ReactNode {
  const attrs = node.attrs as Record<string, unknown> | undefined;
  const children = node.content?.map((child, index) => renderNode(child, notePath, index));
  if (node.type === 'text') {
    let output: ReactNode = node.text ?? '';
    for (const [index, mark] of (node.marks ?? []).entries()) {
      const markKey = `${key}-${index}`;
      if (mark.type === 'bold') output = <strong key={markKey}>{output}</strong>;
      else if (mark.type === 'italic') output = <em key={markKey}>{output}</em>;
      else if (mark.type === 'strike') output = <s key={markKey}>{output}</s>;
      else if (mark.type === 'underline') output = <u key={markKey}>{output}</u>;
      else if (mark.type === 'code') output = <code key={markKey}>{output}</code>;
      else if (mark.type === 'highlight') output = <mark key={markKey}>{output}</mark>;
      else if (mark.type === 'link') {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        output = (
          <span key={markKey} className="note-visual-link" title={href}>
            {output}
          </span>
        );
      }
    }
    return <Fragment key={key}>{output}</Fragment>;
  }
  if (node.type === 'image') {
    return (
      <NoteVisualImage
        key={key}
        notePath={notePath}
        src={typeof attrs?.src === 'string' ? attrs.src : ''}
        alt={typeof attrs?.alt === 'string' ? attrs.alt : ''}
      />
    );
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  if (node.type === 'codeBlock' && isMermaidLanguage(attrs?.language)) {
    return (
      <MermaidDiagram
        key={key}
        source={(node.content ?? []).map((child) => child.text ?? '').join('')}
      />
    );
  }
  if (node.type === 'horizontalRule') return <hr key={key} />;
  if (node.type === 'doc') return <Fragment key={key}>{children}</Fragment>;
  if (node.type === 'heading') {
    const level = Math.min(6, Math.max(1, typeof attrs?.level === 'number' ? attrs.level : 1));
    return createElement(`h${level}`, { key }, children);
  }
  if (node.type === 'taskItem') {
    return (
      <li key={key} className="note-visual-task">
        <span className={cn('note-visual-checkbox', attrs?.checked === true && 'is-checked')} />
        <span>{children}</span>
      </li>
    );
  }
  const tags: Record<string, string> = {
    paragraph: 'p',
    bulletList: 'ul',
    orderedList: 'ol',
    taskList: 'ul',
    listItem: 'li',
    blockquote: 'blockquote',
    codeBlock: 'pre',
    table: 'table',
    tableRow: 'tr',
    tableCell: 'td',
    tableHeader: 'th',
  };
  const tag = tags[node.type ?? ''];
  if (!tag) return <Fragment key={key}>{children}</Fragment>;
  return createElement(
    tag,
    {
      key,
      ...(node.type === 'taskList' ? { className: 'note-visual-tasks' } : {}),
      ...(node.type === 'orderedList' && typeof attrs?.start === 'number'
        ? { start: attrs.start }
        : {}),
      ...(node.type === 'tableCell' || node.type === 'tableHeader'
        ? {
            colSpan: typeof attrs?.colspan === 'number' ? attrs.colspan : 1,
            rowSpan: typeof attrs?.rowspan === 'number' ? attrs.rowspan : 1,
          }
        : {}),
    },
    node.type === 'codeBlock' ? <code>{children}</code> : children,
  );
}

/** A scaled, read-only rendering of the same Markdown structure as the editor. */
export const NoteVisualPreview = memo(function NoteVisualPreview({
  name,
  path,
  content,
  size = 'card',
  frame,
  onDimensions,
}: {
  name: string;
  path: string;
  content: string;
  size?: 'card' | 'large';
  frame?: PreviewSize | undefined;
  onDimensions?: ((size: PreviewSize) => void) | undefined;
}) {
  const body = useRef<HTMLDivElement>(null);
  const font = useNoteStyleStore((state) => state.font);
  const boldColor = useNoteStyleStore((state) => state.boldColor);
  const plain = /\.txt$/i.test(name);
  const document = useMemo(() => parsePreview(content, plain), [content, plain]);
  const rendered = useMemo(() => renderNode(document, path, 0), [document, path]);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element || !onDimensions) return;
    const measure = () => {
      if (element.offsetTop > 0)
        onDimensions({
          width: 760,
          height: Math.min(1068, Math.max(600, element.offsetTop + element.offsetHeight + 90)),
        });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content, font, onDimensions]);

  return (
    <div
      style={
        frame
          ? ({
              width: frame.width,
              height: frame.height,
              '--note-preview-scale': frame.width / 760,
            } as CSSProperties)
          : undefined
      }
      className={cn('note-visual-preview', `is-${size}`)}
      data-font={font}
      data-bold-color={boldColor}
      aria-hidden={size === 'card'}
      role={size === 'large' ? 'img' : undefined}
      aria-label={size === 'large' ? `Page preview of ${name}` : undefined}
    >
      <div className="note-visual-page" aria-hidden="true">
        <h1 className="note-visual-title">{noteTitle(name).replaceAll('_', ' ')}</h1>
        <div ref={body} className="note-visual-body">
          {rendered}
        </div>
      </div>
    </div>
  );
});
