import { studyDocument } from '@/features/documents/lib/studyImport';
import { lazy, Suspense, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, ExternalLink, FileText, Link2, Share2, X } from 'lucide-react';
import { OpenInIliasButton } from '@/features/integrations/components/OpenInIliasButton';
import { objectUrl } from '@/features/integrations/lib/ilias/endpoints';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import type {
  IliasContentItem,
  IliasCourse as ListedCourse,
} from '@/features/integrations/lib/iliasSync';
import { iliasTarget, splitCourseTitle } from '@/features/courses/lib/courses';
import { useCourseFilesStore } from '@/features/courses/store/courseFilesStore';
import { CourseFileIcon } from '@/features/courses/components/CourseFileIcon';
import {
  documentRequest,
  editable,
  fileKind,
  fileSize,
  previewable,
  type DocumentEntry,
  type DocumentPreviewData,
} from '@/features/documents/lib/files';
import type { IliasFileRow } from '@/features/documents/lib/iliasSpace';

const PdfPreview = lazy(() => import('./PdfPreview'));

export type IliasFileSelection =
  | { kind: 'saved'; file: IliasFileRow }
  | {
      kind: 'course';
      item: IliasContentItem;
      course: ListedCourse | undefined;
      trail: { refId: string; title: string | null }[];
    };

function shownDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function IliasFileDetails({
  selection,
  onClose,
  onEdit,
}: {
  selection: IliasFileSelection;
  onClose: () => void;
  onEdit?: ((entry: DocumentEntry) => void) | undefined;
}) {
  const connection = useIliasStore((state) => state.connection);
  const tracked = useCourseFilesStore((state) =>
    selection.kind === 'course' && selection.course
      ? state.folders?.[selection.course.refId]?.files[selection.item.refId]
      : undefined,
  );
  const saving = useCourseFilesStore((state) =>
    selection.kind === 'course' ? state.saving[selection.item.refId] : undefined,
  );
  const saveFile = useCourseFilesStore((state) => state.saveFile);
  const local =
    selection.kind === 'saved'
      ? selection.file.path
      : saving?.state === 'saved'
        ? saving.file.path
        : tracked && tracked.state !== 'removed'
          ? tracked.path
          : null;
  const name = selection.kind === 'saved' ? selection.file.name : selection.item.title;
  const course = selection.kind === 'saved' ? selection.file.course.title : selection.course?.title;
  const courseId =
    selection.kind === 'saved' ? selection.file.course.courseRefId : selection.course?.refId;
  const refId = selection.kind === 'saved' ? selection.file.refId : selection.item.refId;
  const gone = selection.kind === 'saved' && !!selection.file.gone;
  const sourceType = refId && !gone ? 'file' : 'crs';
  const sourceId = refId && !gone ? refId : courseId;
  const target = sourceId ? iliasTarget(sourceType, sourceId) : null;
  const url =
    connection && sourceId
      ? objectUrl(connection.baseUrl, sourceId, sourceType, connection.clientId)
      : null;
  const entry: DocumentEntry | null = local
    ? {
        name,
        path: local,
        folder: false,
        size: selection.kind === 'saved' ? selection.file.size : (selection.item.file?.size ?? 0),
        modified: selection.kind === 'saved' ? selection.file.arrived : 0,
      }
    : null;
  const kindEntry: DocumentEntry = entry ?? {
    name,
    path: '',
    folder: false,
    size: selection.kind === 'saved' ? selection.file.size : (selection.item.file?.size ?? 0),
    modified: 0,
  };
  const previewPath = entry && previewable(entry) ? entry.path : null;
  const textPath = entry && editable(entry) ? entry.path : null;
  const [preview, setPreview] = useState<DocumentPreviewData | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    const read = previewPath
      ? documentRequest<DocumentPreviewData>({ action: 'preview', path: previewPath }).then(
          (result) => {
            if (active) setPreview(result);
          },
        )
      : textPath
        ? documentRequest<string>({ action: 'read', path: textPath }).then((result) => {
            if (active) setPlain(result);
          })
        : Promise.resolve();
    void read.catch((cause: unknown) => {
      if (active) setPreviewError(String(cause));
    });
    return () => {
      active = false;
    };
  }, [previewPath, textPath]);

  async function download() {
    setActionError('');
    setFeedback('');
    setWorking(true);
    try {
      if (local) {
        const savedName = await invoke<string>('download_document', { path: local });
        setFeedback(`${savedName} saved to Downloads`);
      } else if (selection.kind === 'course' && connection && selection.course) {
        if (selection.trail.some((step) => step.title === null))
          throw new Error('This folder is still loading.');
        await saveFile(
          connection,
          selection.course,
          selection.trail.map((step) => ({ refId: step.refId, title: step.title ?? '' })),
          selection.item,
        );
        const result = useCourseFilesStore.getState().saving[selection.item.refId];
        if (result?.state === 'failed') throw new Error(result.message);
        setFeedback('Saved to Documents. The preview is ready.');
      }
    } catch (cause) {
      setActionError(String(cause));
    } finally {
      setWorking(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    setActionError('');
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(gone ? 'Course link copied' : 'File link copied');
    } catch (cause) {
      setActionError(`Could not copy the link: ${String(cause)}`);
    }
  }

  async function share() {
    if (!url) return;
    setActionError('');
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else await copyLink();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setActionError(`Could not share this link: ${String(cause)}`);
    }
  }

  async function openLocal() {
    if (!local) return;
    setActionError('');
    try {
      await documentRequest({ action: 'open', path: local });
    } catch (cause) {
      setActionError(String(cause));
    }
  }

  const updated =
    selection.kind === 'saved' ? selection.file.updatedAt : selection.item.file?.updatedAt;
  const size = selection.kind === 'saved' ? selection.file.size : selection.item.file?.size;
  const folder =
    local?.split('/').slice(0, -1).at(-1) ??
    (selection.kind === 'course' ? selection.trail.at(-1)?.title : null) ??
    'ILIAS';
  const canDownload =
    !!local ||
    (selection.kind === 'course' &&
      !!selection.course &&
      !!connection &&
      selection.trail.every((step) => step.title !== null));

  return (
    <aside className="ilias-file-details" aria-label={`File details: ${name}`}>
      <div className="ilias-file-details-scroll scroll-area">
        <div className="ilias-file-details-top">
          <span>{gone ? 'No longer on ILIAS' : local ? 'In Documents' : 'On ILIAS'}</span>
          <button type="button" aria-label="Close file details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="ilias-file-preview" aria-label={`Preview of ${name}`}>
          {preview?.mime === 'application/pdf' ? (
            <Suspense fallback={<p>Loading PDF preview…</p>}>
              <PdfPreview base64={preview.base64} />
            </Suspense>
          ) : preview ? (
            <img src={`data:${preview.mime};base64,${preview.base64}`} alt={name} />
          ) : plain !== null ? (
            <pre>{plain.slice(0, 12000)}</pre>
          ) : previewError ? (
            <p>{previewError}</p>
          ) : local && entry && (previewable(entry) || editable(entry)) ? (
            <p>Loading preview…</p>
          ) : (
            <div className="ilias-file-preview-empty">
              <CourseFileIcon title={name} suffix={null} />
              <p>
                {local ? 'Preview unavailable for this file type' : 'Download to preview this file'}
              </p>
            </div>
          )}
        </div>
        <div className="ilias-file-details-heading">
          <FileText size={22} aria-hidden />
          <div>
            <h3>{name}</h3>
            <p>
              {fileKind(kindEntry)}
              {size != null ? ` · ${fileSize(size)}` : ''}
            </p>
          </div>
        </div>
        <div className="ilias-file-actions">
          <button type="button" onClick={() => void download()} disabled={working || !canDownload}>
            <Download size={17} aria-hidden />
            <span>{working ? 'Downloading…' : local ? 'Download' : 'Download to Documents'}</span>
          </button>
          <button type="button" onClick={() => void share()} disabled={!url}>
            <Share2 size={17} aria-hidden />
            <span>Share</span>
          </button>
          <button type="button" onClick={() => void copyLink()} disabled={!url}>
            <Link2 size={17} aria-hidden />
            <span>Copy link</span>
          </button>
        </div>
        {feedback ? (
          <p className="ilias-file-feedback" role="status">
            {feedback}
          </p>
        ) : null}
        {actionError ? (
          <p className="ilias-file-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <dl className="ilias-file-facts">
          <div>
            <dt>Course</dt>
            <dd>{course ? splitCourseTitle(course).name : 'Unknown'}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{fileKind(kindEntry)}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{size != null ? fileSize(size) : 'Unknown'}</dd>
          </div>
          <div>
            <dt>Updated on ILIAS</dt>
            <dd>{shownDate(updated)}</dd>
          </div>
          <div>
            <dt>Folder</dt>
            <dd>{folder}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {gone
                ? 'Local copy; removed from ILIAS'
                : local
                  ? 'Available offline'
                  : 'Not downloaded'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="ilias-file-details-footer">
        {entry && onEdit && (studyDocument(entry) || editable(entry)) ? (
          <button type="button" onClick={() => onEdit(entry)}>
            <FileText size={16} aria-hidden /> Im Notizeditor öffnen
          </button>
        ) : null}
        {local ? (
          <button type="button" onClick={() => void openLocal()}>
            <ExternalLink size={16} aria-hidden /> Open file
          </button>
        ) : null}
        {target ? <OpenInIliasButton url={target} /> : null}
      </div>
    </aside>
  );
}
