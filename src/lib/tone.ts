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

/** The full palette a calendar entry can carry — one hue per course. */
export type EventTone =
  'accent' | 'blue' | 'green' | 'yellow' | 'pink' | 'lavender' | 'orange' | 'teal' | 'coral';

interface EventToneStyle {
  /** Tinted card fill. Readable under `text-primary` in both appearances. */
  surface: string;
  /** Saturated bar, dot or progress mark. Decorative, never load-bearing. */
  solid: string;
  /** Saturated text and icons. Reserved for glyphs and short labels. */
  ink: string;
  /** Hairline border in the same hue, so cards read on any surface. */
  edge: string;
}

/**
 * Written out in full because Tailwind reads source text: a template literal
 * such as `bg-${tone}-soft` produces no class at build time.
 */
export const TONE_EVENT: Record<EventTone, EventToneStyle> = {
  accent: {
    surface: 'bg-accent-soft',
    solid: 'bg-accent',
    ink: 'text-accent',
    edge: 'border-accent/35',
  },
  blue: { surface: 'bg-blue-soft', solid: 'bg-blue', ink: 'text-blue', edge: 'border-blue/45' },
  green: {
    surface: 'bg-green-soft',
    solid: 'bg-green',
    ink: 'text-green',
    edge: 'border-green/45',
  },
  yellow: {
    surface: 'bg-yellow-soft',
    solid: 'bg-yellow',
    ink: 'text-yellow',
    edge: 'border-yellow/45',
  },
  pink: { surface: 'bg-pink-soft', solid: 'bg-pink', ink: 'text-pink', edge: 'border-pink/45' },
  lavender: {
    surface: 'bg-lavender-soft',
    solid: 'bg-lavender',
    ink: 'text-lavender',
    edge: 'border-lavender/45',
  },
  orange: {
    surface: 'bg-orange-soft',
    solid: 'bg-orange',
    ink: 'text-orange',
    edge: 'border-orange/45',
  },
  teal: { surface: 'bg-teal-soft', solid: 'bg-teal', ink: 'text-teal', edge: 'border-teal/45' },
  coral: {
    surface: 'bg-coral-soft',
    solid: 'bg-coral',
    ink: 'text-coral',
    edge: 'border-coral/45',
  },
};
