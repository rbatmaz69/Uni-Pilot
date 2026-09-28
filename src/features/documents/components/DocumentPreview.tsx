import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import {
  documentRequest,
  type DocumentEntry,
  type DocumentPreviewData,
} from '@/features/documents/lib/files';

const PdfPreview = lazy(() => import('./PdfPreview'));

export function DocumentPreview({ entry, onClose }: { entry: DocumentEntry; onClose: () => void }) {
  const [data, setData] = useState<DocumentPreviewData | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    documentRequest<DocumentPreviewData>({ action: 'preview', path: entry.path })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [entry.path]);

  return (
    <Modal
      open
      onClose={onClose}
      title={entry.name}
      description="Document preview"
      className="max-w-5xl"
      footer={
        <>
          <Button
            disabled={opening}
            onClick={() => {
              void (async () => {
                setOpening(true);
                try {
                  await documentRequest({ action: 'open', path: entry.path });
                } catch (cause) {
                  setError(String(cause));
                } finally {
                  setOpening(false);
                }
              })();
            }}
          >
            Open in default app
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="py-12 text-center text-muted">
          Loading preview…
        </p>
      )}
      {data?.mime === 'application/pdf' ? (
        <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
          <PdfPreview base64={data.base64} />
        </Suspense>
      ) : data ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg bg-surface-secondary p-3">
          <img
            src={`data:${data.mime};base64,${data.base64}`}
            alt={entry.name}
            className="max-h-[60vh] max-w-full object-contain"
            onError={() =>
              setError('This image could not be displayed. Try opening it in its default app.')
            }
          />
        </div>
      ) : null}
    </Modal>
  );
}
