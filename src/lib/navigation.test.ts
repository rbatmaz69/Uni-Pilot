import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, NAV_ITEMS, NAV_SECTIONS, getNavItemByPath } from './navigation';
import type { AccentTone } from '@/types';

const items = Object.values(NAV_ITEMS);
const TONES: AccentTone[] = ['accent', 'pink', 'yellow', 'blue', 'green', 'lavender'];

describe('navigation config', () => {
  it('gives every entry a unique path', () => {
    const paths = items.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('uses absolute paths without a trailing slash', () => {
    for (const item of items) {
      expect(item.path).toMatch(/^\/[a-z-]+$/);
    }
  });

  it('fills in every field a page needs to render', () => {
    for (const item of items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.subtitle.length).toBeGreaterThan(0);
      expect(item.placeholder.length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
      expect(TONES).toContain(item.tone);
    }
  });

  it('keys every entry consistently with its path', () => {
    for (const [key, item] of Object.entries(NAV_ITEMS)) {
      expect(item.path).toBe(`/${key}`);
    }
  });
});

describe('navigation sections', () => {
  it('uses unique, non-empty sections', () => {
    const ids = NAV_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const section of NAV_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('places every entry except Settings in exactly one section', () => {
    const sectioned = NAV_SECTIONS.flatMap((section) => section.items);
    const expected = items.filter((item) => item.path !== NAV_ITEMS.settings.path);

    expect(new Set(sectioned).size).toBe(sectioned.length);
    expect(sectioned).toHaveLength(expected.length);
    expect(new Set(sectioned)).toEqual(new Set(expected));
  });
});

describe('getNavItemByPath', () => {
  it('resolves every configured path', () => {
    for (const item of items) {
      expect(getNavItemByPath(item.path)).toBe(item);
    }
  });

  it('returns undefined for an unknown path', () => {
    expect(getNavItemByPath('/nope')).toBeUndefined();
  });

  it('resolves the default route', () => {
    expect(getNavItemByPath(DEFAULT_ROUTE)).toBe(NAV_ITEMS.dashboard);
  });
});
