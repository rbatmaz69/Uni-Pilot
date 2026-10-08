import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Download, Layers } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { studyToolsStore } from '@/features/documents/store/studyToolsStore';
import { insertStudyPages } from '@/features/documents/lib/studyPages';
import {
  documentRequest,
  uploadDocument,
  MAX_UPLOAD_BYTES,
  type DocumentEntry,
  type DirectoryListing,
} from '@/features/documents/lib/files';
import { uniqueOutputName } from '@/features/documents/lib/documentTools';

export function StudyDocumentControls({
  editor,
  entry,
  readContent,
  flush,
  report,
}: {
  editor: Editor;
  entry: DocumentEntry;
  readContent: () => string;
  flush: () => Promise<boolean>;
  report: (notice: { tone: 'error' | 'info'; text: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  async function exportPdf() {
    setBusy(true);
    try {
      // Commit an inline PDF text field before reading the Markdown.
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!(await flush())) throw new Error('Bitte zuerst den Speicherkonflikt lösen.');
      const { exportStudyMarkdown } = await import('@/features/documents/lib/studyExport');
      const bytes = await exportStudyMarkdown(readContent(), entry.path);
      if (bytes.length > MAX_UPLOAD_BYTES)
        throw new Error('Das exportierte PDF ist größer als 25 MB. Bitte das Dokument aufteilen.');
      const path = entry.path.split('/').slice(0, -1).join('/');
      const listing = await documentRequest<DirectoryListing>({ action: 'list', path });
      const name = uniqueOutputName(
        `${entry.name.replace(/\.(md|markdown)$/i, '')}.pdf`,
        listing.entries.map((item) => item.name),
      );
      await uploadDocument({ kind: 'import', path, name }, bytes);
      report({ tone: 'info', text: `„${name}“ wurde neben deinen Aufschrieben gespeichert.` });
    } catch (cause) {
      report({ tone: 'error', text: String(cause) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="study-document-controls">
        <Button
          size="sm"
          variant="ghost"
          disabled={!editor.isEditable || busy}
          leadingIcon={<Layers size={15} />}
          onClick={() => setOpen(true)}
        >
          Notizseiten
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          leadingIcon={<Download size={15} />}
          onClick={() => void exportPdf()}
        >
          {busy ? 'Export läuft…' : 'PDF exportieren'}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notizseiten einfügen"
        description="Füge nach jeder Originalseite Platz für deine Aufschriebe ein. Vorhandene Notizen bleiben erhalten."
        footer={
          <Button
            disabled={!Number.isInteger(count) || count < 1 || count > 10}
            onClick={() => {
              try {
                if (insertStudyPages(editor, count, 'each'))
                  studyToolsStore(editor).setState({ tool: 'select', selected: null });
                setOpen(false);
              } catch (cause) {
                report({ tone: 'error', text: String(cause) });
              }
            }}
          >
            Nach jeder Originalseite einfügen
          </Button>
        }
      >
        <label className="study-page-count">
          Seiten je Originalseite
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <p className="text-muted text-sm mt-3">
          Mit „Notizseite“ an einem Blatt kannst du auch einzelne Seiten dazwischen setzen.
          Rückgängig funktioniert wie im Notizeditor.
        </p>
      </Modal>
    </>
  );
}
