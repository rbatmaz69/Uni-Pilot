import {
  FOCUS_MEDIA_RULES,
  addFocusMedia,
  listFocusMedia,
  removeFocusMedia,
} from '@/features/focus/lib/media';

/** Backwards-compatible image API used by existing callers and persisted records. */
export interface FocusBackground {
  id: string;
  name: string;
  image: Blob;
  addedAt: number;
}

export const ACCEPTED_IMAGE_TYPES = [...FOCUS_MEDIA_RULES.image.accept];
export const MAX_IMAGE_BYTES = FOCUS_MEDIA_RULES.image.maxBytes;

export async function listFocusBackgrounds(): Promise<FocusBackground[]> {
  const items = await listFocusMedia('image');
  return items.map(({ id, name, file, addedAt }) => ({ id, name, image: file, addedAt }));
}

export async function addFocusBackground(file: File): Promise<string> {
  return (await addFocusMedia('image', file)).id;
}

export async function removeFocusBackground(id: string): Promise<void> {
  await removeFocusMedia('image', id);
}
