import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, ImagePlus, Trash2, X } from 'lucide-react';
import { IconButton } from '@/components/ui';
import {
  ACCEPTED_IMAGE_TYPES,
  addFocusBackground,
  removeFocusBackground,
  type FocusBackground,
} from '@/features/focus/lib/backgrounds';
import { FOCUS_VIDEOS } from '@/features/focus/lib/videos';

export interface BackgroundOption extends FocusBackground {
  url: string;
}

interface FocusBackgroundPanelProps {
  selectedId: string | null;
  images: BackgroundOption[];
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}

export function FocusBackgroundPanel({
  selectedId,
  images,
  onSelect,
  onRefresh,
  onClose,
  loading,
  error,
}: FocusBackgroundPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const addImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setActionError(null);
    let lastId: string | null = null;
    try {
      for (const file of files) lastId = await addFocusBackground(file);
      onRefresh();
      if (lastId) onSelect(lastId);
    } catch (cause) {
      onRefresh();
      setActionError(
        cause instanceof Error ? cause.message : 'Could not save this image. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await removeFocusBackground(id);
      if (selectedId === id) onSelect(null);
      onRefresh();
    } catch {
      setActionError('Could not remove this image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-start justify-end sm:inset-5">
      <div
        id="focus-backgrounds"
        ref={panelRef}
        role="dialog"
        aria-label="Choose background"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-surface/95 text-primary shadow-raised backdrop-blur-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Focus backgrounds</h2>
          <IconButton label="Close backgrounds" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="scroll-area min-h-0 overflow-y-auto p-5">
          <p className="mb-4 text-xs leading-relaxed text-secondary">
            Choose a built-in focus video or add your own image. Videos play with their original
            sound while your Pomodoro is running.
          </p>
          <h3 className="mb-2 text-xs font-semibold text-secondary">Focus videos</h3>
          <div className="mb-5 space-y-2">
            {FOCUS_VIDEOS.map((video) => (
              <button
                key={video.id}
                type="button"
                aria-pressed={selectedId === video.id}
                onClick={() => onSelect(video.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-surface-hover"
              >
                <video
                  src={video.src}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  className="h-10 w-14 shrink-0 rounded-md bg-surface-secondary object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-medium" title={video.name}>
                  {video.name}
                </span>
                {selectedId === video.id && (
                  <Check size={16} className="shrink-0 text-accent" aria-hidden />
                )}
              </button>
            ))}
          </div>
          <h3 className="mb-2 text-xs font-semibold text-secondary">Your images</h3>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            <ImagePlus size={16} aria-hidden /> Add your images
            <input
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={busy}
              onChange={(event) => {
                void addImages(event);
              }}
              className="sr-only"
            />
          </label>
          {(error || actionError) && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {actionError || error}
            </p>
          )}
          {loading ? (
            <p role="status" className="mt-5 text-xs text-muted">
              Loading images…
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              <button
                type="button"
                aria-pressed={selectedId === null}
                onClick={() => onSelect(null)}
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-surface-hover"
              >
                <span className="h-10 w-14 shrink-0 rounded-md bg-surface-secondary" aria-hidden />
                <span className="min-w-0 flex-1 font-medium">No image</span>
                {selectedId === null && <Check size={16} className="text-accent" aria-hidden />}
              </button>
              {images.map((image) => (
                <div key={image.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={selectedId === image.id}
                    onClick={() => onSelect(image.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-surface-hover"
                  >
                    <img
                      src={image.url}
                      alt=""
                      className="h-10 w-14 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium" title={image.name}>
                      {image.name}
                    </span>
                    {selectedId === image.id && (
                      <Check size={16} className="shrink-0 text-accent" aria-hidden />
                    )}
                  </button>
                  <IconButton
                    label={`Remove ${image.name}`}
                    disabled={busy}
                    onClick={() => {
                      void removeImage(image.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
              {images.length === 0 && (
                <p className="py-4 text-center text-xs text-muted">No images added yet.</p>
              )}
            </div>
          )}
          <p className="mt-4 text-[11px] text-muted">
            JPEG, PNG, WebP, AVIF or GIF · up to 50 MB each
          </p>
        </div>
      </div>
    </div>
  );
}
