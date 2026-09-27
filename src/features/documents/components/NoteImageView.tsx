import { useEffect, useState } from 'react';
import type { ImageOptions } from '@tiptap/extension-image';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ImageOff } from 'lucide-react';
import { resolveNoteLink } from '@/features/documents/lib/attachments';
import { loadAttachment } from '@/features/documents/lib/previewCache';
import { cn } from '@/lib/utils';

export type NoteImageOptions = ImageOptions & {
  /** The note's workspace path; relative image links resolve from its folder. */
  notePath: string;
};

type Loaded = { path: string; url: string | null };

export function NoteImageView({ node, extension, selected }: ReactNodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const { notePath } = extension.options as NoteImageOptions;
  const path = resolveNoteLink(notePath, src);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  useEffect(() => {
    if (path === null) return;
    let active = true;
    loadAttachment(path).then(
      (data) => {
        if (active) setLoaded({ path, url: `data:${data.mime};base64,${data.base64}` });
      },
      () => {
        if (active) setLoaded({ path, url: null });
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  // Web and data URLs load directly; workspace files come through the backend,
  // which keeps the webview's file access limited to the document workspace.
  const url = path === null ? src : loaded?.path === path ? loaded.url : undefined;
  const failed = url === null || (url !== undefined && brokenSrc === url);

  return (
    <NodeViewWrapper className={cn('note-image', selected && 'is-selected')} data-drag-handle>
      {failed ? (
        <span className="note-image-missing" role="img" aria-label={alt || 'Missing image'}>
          <ImageOff size={18} aria-hidden />
          <span>
            {path === null
              ? 'Web images are not shown in the offline editor.'
              : 'This image is missing from the attachments folder.'}
            <code>{src}</code>
          </span>
        </span>
      ) : url ? (
        <img src={url} alt={alt} draggable={false} onError={() => setBrokenSrc(url)} />
      ) : (
        <span className="note-image-loading" role="img" aria-label={`Loading ${alt || 'image'}`} />
      )}
    </NodeViewWrapper>
  );
}
