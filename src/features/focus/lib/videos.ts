export interface FocusVideo {
  id: `video:${string}`;
  name: string;
  src: string;
}

/**
 * Built-in focus videos are copied unchanged by Vite from public/focus/videos.
 * Keep the IDs stable because the selected background is persisted locally.
 */
export const FOCUS_VIDEOS = [
  { id: 'video:focus-1', name: 'Wasserfall', src: '/focus/videos/focus-1.mp4' },
  { id: 'video:focus-2', name: 'Regen', src: '/focus/videos/focus-2.mp4' },
  { id: 'video:focus-3', name: 'Piano', src: '/focus/videos/focus-3.mp4' },
] as const satisfies readonly FocusVideo[];

export function findFocusVideo(id: string | null): FocusVideo | undefined {
  return FOCUS_VIDEOS.find((video) => video.id === id);
}
