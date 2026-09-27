import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Combine, FileImage, ImageDown, Plus, Scissors, X } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import {
  availableDocumentTools,
  fileExtension,
  type DocumentTool,
} from '@/features/documents/lib/documentTools';
import type { DocumentEntry } from '@/features/documents/lib/files';

const LABELS: Record<DocumentTool, string> = {
  'smaller-image': 'Make upload smaller',
  jpg: 'Convert to JPG',
  png: 'Convert to PNG',
  webp: 'Convert to WebP',
  'image-pdf': 'Make submission PDF',
  'multi-image-pdf': 'Combine photos into PDF',
  'merge-pdf': 'Combine PDFs',
  'extract-pages': 'Extract pages',
  'reorder-pdf': 'Reorder pages',
  'split-pdf': 'Split PDF in two',
  'pdf-image': 'Export page as PNG',
  'smaller-pdf': 'Make upload copy smaller',
  'note-pdf': 'Export note text as PDF',
};

function ToolIcon({ tool }: { tool: DocumentTool }) {
  if (tool === 'smaller-image' || tool === 'smaller-pdf') return <ImageDown size={16} />;
  if (tool === 'image-pdf' || tool === 'pdf-image' || tool === 'note-pdf')
    return <FileImage size={16} />;
  if (tool === 'merge-pdf' || tool === 'multi-image-pdf') return <Combine size={16} />;
  if (tool === 'extract-pages' || tool === 'split-pdf') return <Scissors size={16} />;
  return <ArrowDownToLine size={16} />;
}

export function FileTools({
  entry,
  siblings,
  disabled,
  onExecute,
}: {
  entry: DocumentEntry;
  siblings: DocumentEntry[];
  disabled: boolean;
  onExecute: (
    tool: DocumentTool,
    options?: { other?: DocumentEntry; others?: DocumentEntry[]; pages?: string },
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DocumentTool | null>(null);
  const [pages, setPages] = useState('1');
  const [otherPath, setOtherPath] = useState('');
  const [extraPaths, setExtraPaths] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const tools = availableDocumentTools(entry, siblings);
  const pdfs = siblings.filter(
    (candidate) => candidate.path !== entry.path && fileExtension(candidate.name) === 'pdf',
  );
  const images = siblings.filter(
    (candidate) =>
      candidate.path !== entry.path &&
      ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fileExtension(candidate.name)),
  );

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  if (!tools.length) return null;

  async function execute(
    tool: DocumentTool,
    options?: { other?: DocumentEntry; others?: DocumentEntry[]; pages?: string },
  ) {
    setWorking(true);
    setOpen(false);
    try {
      if (await onExecute(tool, options)) setDialog(null);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="document-file-tools" ref={host}>
        <Button
          size="sm"
          disabled={disabled || working}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={14} /> : <Plus size={14} />}
          Tools
        </Button>
        {open && (
          <div
            className="document-file-tools-menu"
            role="menu"
            aria-label={`Tools for ${entry.name}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                host.current?.querySelector('button')?.focus();
              }
            }}
          >
            <div className="document-file-tools-intro">
              <span>STUDY FILE TOOLS</span>
              <strong>{entry.name}</strong>
              <small>Creates a new file. Your original stays untouched.</small>
            </div>
            {tools.map((tool) => (
              <button
                type="button"
                role="menuitem"
                key={tool}
                onClick={() => {
                  setOpen(false);
                  if (
                    tool === 'merge-pdf' ||
                    tool === 'multi-image-pdf' ||
                    tool === 'extract-pages' ||
                    tool === 'reorder-pdf' ||
                    tool === 'split-pdf' ||
                    tool === 'pdf-image' ||
                    tool === 'smaller-pdf' ||
                    tool === 'note-pdf'
                  ) {
                    setOtherPath(pdfs[0]?.path ?? '');
                    setExtraPaths([]);
                    setDialog(tool);
                  } else void execute(tool);
                }}
              >
                <ToolIcon tool={tool} />
                <span>{LABELS[tool]}</span>
                {(tool === 'image-pdf' || tool === 'multi-image-pdf') && <small>PDF</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!working) setDialog(null);
        }}
        title={dialog ? LABELS[dialog] : 'File tools'}
        description="The result will appear in the same folder as a new file."
        footer={
          <>
            <Button disabled={working} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                working ||
                (dialog === 'merge-pdf' && !otherPath) ||
                (dialog === 'multi-image-pdf' && !extraPaths.length)
              }
              onClick={() => {
                if (!dialog) return;
                const other = pdfs.find((item) => item.path === otherPath);
                void execute(dialog, {
                  ...(other ? { other } : {}),
                  others: images.filter((item) => extraPaths.includes(item.path)),
                  pages,
                });
              }}
            >
              {working ? 'Working…' : 'Create file'}
            </Button>
          </>
        }
      >
        {dialog === 'merge-pdf' && (
          <label className="document-tool-field">
            <span>Append after {entry.name}</span>
            <select value={otherPath} onChange={(event) => setOtherPath(event.target.value)}>
              {pdfs.map((item) => (
                <option value={item.path} key={item.path}>
                  {item.name}
                </option>
              ))}
            </select>
            <small>Pages from this PDF will follow the pages in {entry.name}.</small>
          </label>
        )}
        {dialog === 'multi-image-pdf' && (
          <fieldset className="document-tool-field">
            <legend>Add photos after {entry.name}</legend>
            <div className="document-tool-checklist">
              {images.map((item) => (
                <label key={item.path}>
                  <input
                    type="checkbox"
                    checked={extraPaths.includes(item.path)}
                    onChange={(event) =>
                      setExtraPaths((current) =>
                        event.target.checked
                          ? [...current, item.path]
                          : current.filter((path) => path !== item.path),
                      )
                    }
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
            <small>The selected photo comes first; checked photos follow in the order shown.</small>
          </fieldset>
        )}
        {dialog === 'extract-pages' && (
          <label className="document-tool-field">
            <span>Pages to keep</span>
            <input
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              placeholder="1-3, 5"
            />
            <small>Enter page numbers or ranges, for example 1-3, 5.</small>
          </label>
        )}
        {dialog === 'reorder-pdf' && (
          <label className="document-tool-field">
            <span>New page order</span>
            <input
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              placeholder="3, 1-2, 4"
            />
            <small>Include every page exactly once. Example: 3, 1-2, 4.</small>
          </label>
        )}
        {dialog === 'split-pdf' && (
          <label className="document-tool-field">
            <span>Split after page</span>
            <input
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              inputMode="numeric"
              placeholder="3"
            />
            <small>Creates two PDFs: pages before and after this point.</small>
          </label>
        )}
        {dialog === 'pdf-image' && (
          <label className="document-tool-field">
            <span>Page to export</span>
            <input
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              inputMode="numeric"
              placeholder="1"
            />
            <small>Exports one page as a full-size PNG image.</small>
          </label>
        )}
        {dialog === 'smaller-pdf' && (
          <p className="document-tool-warning">
            This makes an image copy of each page. Text selection, search, links, and accessibility
            information may be lost. Use it for a scanned PDF or when an upload has a strict size
            limit.
          </p>
        )}
        {dialog === 'note-pdf' && (
          <p className="document-tool-warning">
            This exports the note’s text as a readable PDF. Embedded images and drawings are shown
            as text references, and PDF text cannot be selected. The original note is unchanged.
          </p>
        )}
      </Modal>
    </>
  );
}
