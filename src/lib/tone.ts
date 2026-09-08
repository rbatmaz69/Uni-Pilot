import type { AccentTone } from '@/types';

/** Background + foreground pairing for a page's accent mark. */
export const TONE_SURFACE: Record<AccentTone, string> = {
  accent: 'bg-accent-soft text-accent',
  pink: 'bg-pink-soft text-primary',
  yellow: 'bg-yellow-soft text-primary',
  blue: 'bg-blue-soft text-primary',
  green: 'bg-green-soft text-primary',
  lavender: 'bg-lavender-soft text-primary',
};
