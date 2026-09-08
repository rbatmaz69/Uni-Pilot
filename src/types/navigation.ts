import type { LucideIcon } from 'lucide-react';

/** Accent token used for a page's identity mark. One tone per page keeps the UI calm. */
export type AccentTone = 'accent' | 'pink' | 'yellow' | 'blue' | 'green' | 'lavender';

export interface NavItem {
  path: string;
  label: string;
  subtitle: string;
  placeholder: string;
  icon: LucideIcon;
  tone: AccentTone;
}

export interface NavSection {
  id: string;
  label: string;
  items: readonly NavItem[];
}
