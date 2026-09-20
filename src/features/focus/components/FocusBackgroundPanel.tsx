import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  Image as ImageIcon,
  ImagePlus,
  Music2,
  Plus,
  Trash2,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { FOCUS_MEDIA_RULES, type FocusMediaKind } from '@/features/focus/lib/media';
import { useFocusMedia, type FocusMediaItem } from '@/features/focus/components/FocusMediaContext';
import { FocusSidePanel } from '@/features/focus/components/FocusSidePanel';

interface FocusBackgroundPanelProps {
  open: boolean;
  onClose: () => void;
}

interface DisplayMediaItem {
  id: string;
  name: string;
  url: string;
  kind: FocusMediaKind;
  removable: boolean;
  stored?: FocusMediaItem;
  hasAudio?: boolean;
  audioSource?: FocusMediaItem['audioSource'];
}

interface MediaSectionProps {
  open: boolean;
  title: string;
  icon: ReactNode;
  items: DisplayMediaItem[];
  selectedId: string | null;
  playing: boolean;
  addLabel: string;
  addAriaLabel: string;
  accept: string;
  helper: string;
  empty: string;
  busy: boolean;
  disabled?: boolean;
  disabledMessage?: string | undefined;
  error?: string | undefined;
  onAdd: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (item: DisplayMediaItem) => void;
  onClear?: (() => void) | undefined;
  onRemove: (item: DisplayMediaItem) => void;
  onToggleVideoAudio?: ((item: DisplayMediaItem) => void) | undefined;
}

function MediaPreview({ item }: { item: DisplayMediaItem }) {
  if (item.kind === 'image') {
    return <img src={item.url} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" />;
  }
  if (item.kind === 'video') {
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="focus-side-panel-thumbnail h-11 w-16 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <span className="focus-side-panel-thumbnail grid h-11 w-16 shrink-0 place-items-center rounded-md">
      <Music2 size={18} aria-hidden />
    </span>
  );
}

function mediaDescription(item: DisplayMediaItem) {
  if (item.kind === 'image') return 'Image';
  if (item.kind === 'music') return 'Music';
  if (item.audioSource === 'fallback') return 'Video · check audio setting';
  return item.hasAudio ? 'Video · with audio' : 'Video · silent';
}

function MediaSection({
  open,
  title,
  icon,
  items,
  selectedId,
  playing,
  addLabel,
  addAriaLabel,
  accept,
  helper,
  empty,
  busy,
  disabled = false,
  disabledMessage,
  error,
  onAdd,
  onSelect,
  onClear,
  onRemove,
  onToggleVideoAudio,
}: MediaSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    if (!open || !selectedId) return;
    const list = listRef.current;
    const item = itemRefs.current.get(selectedId);
    if (!list || !item) return;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop += itemRect.top - listRect.top;
    else if (itemRect.bottom > listRect.bottom) {
      list.scrollTop += itemRect.bottom - listRect.bottom;
    }
  }, [items.length, open, selectedId]);

  return (
    <section aria-label={title} className="focus-media-section">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--focus-side-panel-muted)]">
          {icon}
          {title}
        </h3>
        {selectedId && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-[var(--focus-side-panel-accent)] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="focus-media-empty grid min-h-16 place-items-center rounded-lg px-3 text-center text-xs text-[var(--focus-side-panel-muted)]">
          {empty}
        </p>
      ) : (
        <div
          ref={listRef}
          role="list"
          aria-label={`${title} library`}
          className="focus-media-list scroll-area space-y-2 overflow-y-auto pr-1"
        >
          {items.map((item) => {
            const selected = selectedId === item.id;
            const status = selected ? (playing ? 'Active' : 'Selected') : null;
            return (
              <div
                key={item.id}
                role="listitem"
                ref={(element) => {
                  if (element) itemRefs.current.set(item.id, element);
                  else itemRefs.current.delete(item.id);
                }}
                className={cn(
                  'focus-media-row relative flex items-center gap-1 rounded-lg',
                  selected && 'focus-media-row-selected',
                )}
              >
                <button
                  type="button"
                  aria-label={item.name}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onSelect(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <MediaPreview item={item} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={item.name}>
                      {item.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--focus-side-panel-muted)]">
                      {mediaDescription(item)}
                      {status ? ` · ${status}` : ''}
                    </span>
                  </span>
                  {selected && (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--focus-side-panel-accent)] text-[var(--focus-side-panel-accent)]">
                      <Check size={13} aria-hidden />
                    </span>
                  )}
                </button>

                {item.removable && item.kind === 'video' && onToggleVideoAudio && (
                  <IconButton
                    label={`${item.name}: mark as ${item.hasAudio ? 'silent' : 'with audio'}`}
                    disabled={busy}
                    size="sm"
                    onClick={() => onToggleVideoAudio(item)}
                    className="shrink-0"
                  >
                    {item.hasAudio ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  </IconButton>
                )}
                {item.removable && (
                  <IconButton
                    label={`Remove ${item.name}`}
                    disabled={busy}
                    size="sm"
                    onClick={() => onRemove(item)}
                    className="mr-1 shrink-0"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      {disabledMessage && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--focus-side-panel-muted)]">
          {disabledMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="focus-media-add inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium focus-within:outline-2 focus-within:outline-offset-2">
          {title === 'Images' ? (
            <ImagePlus size={14} aria-hidden />
          ) : (
            <Plus size={14} aria-hidden />
          )}
          {addLabel}
          <input
            type="file"
            multiple
            accept={accept}
            disabled={busy}
            aria-label={addAriaLabel}
            onChange={onAdd}
            className="sr-only"
          />
        </label>
        <span className="text-right text-[9px] text-[var(--focus-side-panel-muted)]">{helper}</span>
      </div>
    </section>
  );
}

export function FocusBackgroundPanel({ open, onClose }: FocusBackgroundPanelProps) {
  const state = useFocusStore();
  const { images, videos, music, loading, error, addFiles, remove, setVideoHasAudio } =
    useFocusMedia();
  const [busyKind, setBusyKind] = useState<FocusMediaKind | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<FocusMediaKind, string | undefined>>({
    image: undefined,
    video: undefined,
    music: undefined,
  });
  const playing = state.status === 'running' && state.phase === 'work';

  const videoItems = useMemo<DisplayMediaItem[]>(
    () =>
      videos.map((video) => ({
        id: video.id,
        name: video.name,
        url: video.url,
        kind: 'video' as const,
        removable: true,
        stored: video,
        hasAudio: video.hasAudio ?? true,
        ...(video.audioSource ? { audioSource: video.audioSource } : {}),
      })),
    [videos],
  );
  const imageItems = useMemo<DisplayMediaItem[]>(
    () =>
      images.map((image) => ({
        id: image.id,
        name: image.name,
        url: image.url,
        kind: 'image',
        removable: true,
        stored: image,
      })),
    [images],
  );
  const musicItems = useMemo<DisplayMediaItem[]>(
    () =>
      music.map((track) => ({
        id: track.id,
        name: track.name,
        url: track.url,
        kind: 'music',
        removable: true,
        stored: track,
      })),
    [music],
  );
  const selectedVideo = videoItems.find((video) => video.id === state.backgroundId);
  const musicBlocked = selectedVideo?.hasAudio === true;
  const selectedImageId = imageItems.some((image) => image.id === state.backgroundId)
    ? state.backgroundId
    : null;
  const selectedVideoId = selectedVideo?.id ?? null;

  useEffect(() => {
    if (loading || error) return;
    if (
      state.backgroundId &&
      !imageItems.some((item) => item.id === state.backgroundId) &&
      !videoItems.some((item) => item.id === state.backgroundId)
    ) {
      state.setBackgroundId(null);
    }
    if (state.musicId && !musicItems.some((item) => item.id === state.musicId)) {
      state.setMusicId(null);
    }
  }, [error, imageItems, loading, musicItems, state, videoItems]);

  const add = async (kind: FocusMediaKind, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusyKind(kind);
    setActionErrors((current) => ({ ...current, [kind]: undefined }));
    try {
      const added = await addFiles(kind, files);
      const last = added.at(-1);
      if (!last) return;
      if (kind === 'music') {
        if (!musicBlocked) state.setMusicId(last.id);
      } else {
        state.setBackgroundId(last.id);
        if (kind === 'video' && last.hasAudio) state.setMusicId(null);
      }
    } catch (cause) {
      setActionErrors((current) => ({
        ...current,
        [kind]: cause instanceof Error ? cause.message : 'Could not save this file.',
      }));
    } finally {
      setBusyKind(null);
    }
  };

  const removeItem = async (item: DisplayMediaItem) => {
    if (!item.stored) return;
    setBusyKind(item.kind);
    setActionErrors((current) => ({ ...current, [item.kind]: undefined }));
    try {
      await remove(item.stored);
      if (state.backgroundId === item.id) state.setBackgroundId(null);
      if (state.musicId === item.id) state.setMusicId(null);
    } catch {
      setActionErrors((current) => ({
        ...current,
        [item.kind]: 'Could not remove this file. Please try again.',
      }));
    } finally {
      setBusyKind(null);
    }
  };

  const toggleVideoAudio = async (item: DisplayMediaItem) => {
    if (!item.stored) return;
    const hasAudio = !item.hasAudio;
    setBusyKind('video');
    setActionErrors((current) => ({ ...current, video: undefined }));
    try {
      await setVideoHasAudio(item.id, hasAudio);
      if (hasAudio && state.backgroundId === item.id) state.setMusicId(null);
    } catch {
      setActionErrors((current) => ({
        ...current,
        video: 'Could not update the video audio setting.',
      }));
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <FocusSidePanel
      open={open}
      id="focus-backgrounds"
      title="Focus backgrounds"
      subtitle="Choose a visual background and optional focus music. Media stays on this device."
      closeLabel="Close backgrounds"
      onClose={onClose}
      onAfterClose={() => setActionErrors({ image: undefined, video: undefined, music: undefined })}
    >
      {error && (
        <p role="alert" className="mb-4 text-xs text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-6 text-center text-xs text-[var(--focus-side-panel-muted)]">
          Loading media…
        </p>
      ) : (
        <div className="space-y-5">
          <MediaSection
            open={open}
            title="Images"
            icon={<ImageIcon size={13} aria-hidden />}
            items={imageItems}
            selectedId={selectedImageId}
            playing={playing}
            addLabel="Add images"
            addAriaLabel="Add your images"
            accept={FOCUS_MEDIA_RULES.image.accept.join(',')}
            helper="JPEG, PNG, WebP, AVIF or GIF · 50 MB"
            empty="No images added yet."
            busy={busyKind !== null}
            error={actionErrors.image}
            onAdd={(event) => void add('image', event)}
            onSelect={(item) => state.setBackgroundId(item.id)}
            onClear={selectedImageId ? () => state.setBackgroundId(null) : undefined}
            onRemove={(item) => void removeItem(item)}
          />

          <MediaSection
            open={open}
            title="Videos"
            icon={<Video size={13} aria-hidden />}
            items={videoItems}
            selectedId={selectedVideoId}
            playing={playing}
            addLabel="Add videos"
            addAriaLabel="Add your videos"
            accept={FOCUS_MEDIA_RULES.video.accept.join(',')}
            helper="MP4, WebM or MOV · 200 MB"
            empty="No videos added yet."
            busy={busyKind !== null}
            error={actionErrors.video}
            onAdd={(event) => void add('video', event)}
            onSelect={(item) => {
              state.setBackgroundId(item.id);
              if (item.hasAudio) state.setMusicId(null);
            }}
            onClear={selectedVideoId ? () => state.setBackgroundId(null) : undefined}
            onRemove={(item) => void removeItem(item)}
            onToggleVideoAudio={(item) => void toggleVideoAudio(item)}
          />

          <MediaSection
            open={open}
            title="Music"
            icon={<Music2 size={13} aria-hidden />}
            items={musicItems}
            selectedId={state.musicId}
            playing={playing && state.ambientAudioEnabled}
            addLabel="Add music"
            addAriaLabel="Add your music"
            accept={FOCUS_MEDIA_RULES.music.accept.join(',')}
            helper="MP3, OGG, WAV or FLAC · 50 MB"
            empty="No music added yet."
            busy={busyKind !== null}
            disabled={musicBlocked}
            disabledMessage={
              musicBlocked
                ? 'Music is unavailable while the selected video uses its own audio.'
                : undefined
            }
            error={actionErrors.music}
            onAdd={(event) => void add('music', event)}
            onSelect={(item) => {
              if (!musicBlocked) state.setMusicId(item.id);
            }}
            onClear={state.musicId ? () => state.setMusicId(null) : undefined}
            onRemove={(item) => void removeItem(item)}
          />
        </div>
      )}
    </FocusSidePanel>
  );
}
