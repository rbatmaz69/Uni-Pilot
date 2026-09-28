import type { DocumentPreviewData } from '@/features/documents/lib/files';
import type { PreviewSize } from '@/features/documents/lib/folderLayout';
import { PdfThumbnail } from './PdfThumbnail';

export function DocumentThumbnail({
  data,
  alt,
  onDimensions,
}: {
  data: DocumentPreviewData;
  alt: string;
  onDimensions?: ((size: PreviewSize) => void) | undefined;
}) {
  if (data.mime === 'application/pdf')
    return <PdfThumbnail base64={data.base64} alt={alt} onDimensions={onDimensions} />;

  return (
    <img
      src={`data:${data.mime};base64,${data.base64}`}
      alt={alt}
      className="canvas-paper-media-image"
      draggable={false}
      onLoad={(event) =>
        onDimensions?.({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
}
