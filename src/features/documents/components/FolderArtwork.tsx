import { memo, useEffect, useState, type CSSProperties } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  documentRequest,
  editable,
  previewable,
  type DirectoryListing,
  type DocumentEntry,
  type DocumentPreviewData,
} from '../lib/files';
import { loadNotePreview, loadPreview } from '../lib/previewCache';
import { DocumentThumbnail } from './DocumentThumbnail';
import { NoteVisualPreview } from './NoteVisualPreview';

type Peek = { entry: DocumentEntry; note?: string; media?: DocumentPreviewData };

/** A shallow, bounded preview: never walk the folder tree to decorate a folder. */
export const FolderArtwork = memo(function FolderArtwork({
  entry,
  enabled,
}: {
  entry: DocumentEntry;
  enabled: boolean;
}) {
  const [peek, setPeek] = useState<{ path: string; items: Peek[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void documentRequest<DirectoryListing>({ action: 'list', path: entry.path })
      .then(async ({ entries }) => {
        const children = entries
          .filter((child) => !child.folder)
          .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
          .slice(0, 3);
        const items = await Promise.all(
          children.map(async (child): Promise<Peek> => {
            try {
              if (editable(child) && child.size <= 2 * 1024 * 1024)
                return {
                  entry: child,
                  note: await loadNotePreview(child),
                };
              if (
                previewable(child) &&
                !/\.pdf$/i.test(child.name) &&
                child.size <= 12 * 1024 * 1024
              )
                return { entry: child, media: await loadPreview(child) };
            } catch {
              // An unavailable preview must never prevent opening the folder.
            }
            return { entry: child };
          }),
        );
        if (active) setPeek({ path: entry.path, items });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entry.path, entry.modified, enabled]);

  return (
    <div className="canvas-folder-art" aria-hidden>
      <div className="canvas-folder-pocket">
        {(peek?.path === entry.path ? peek.items : []).map((item, index) => (
          <div
            className="canvas-folder-peek"
            key={item.entry.path}
            style={
              { '--peek-index': index, '--peek-angle': `${(index - 1) * 5}deg` } as CSSProperties
            }
          >
            <div className="canvas-folder-peek-content">
              {item.media ? (
                <DocumentThumbnail data={item.media} alt="" />
              ) : item.note !== undefined ? (
                <NoteVisualPreview
                  name={item.entry.name}
                  path={item.entry.path}
                  content={item.note}
                />
              ) : (
                <span className="canvas-folder-peek-name">{item.entry.name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="canvas-folder-front">
        <FolderOpen size={23} strokeWidth={1.3} />
      </div>
    </div>
  );
});
