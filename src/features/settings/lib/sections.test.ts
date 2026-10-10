import { describe, expect, it } from 'vitest';
import { SETTINGS_SECTIONS, settingsSection, settingsSectionPath } from './sections';

describe('settingsSection', () => {
  it('finds every section by its id', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(settingsSection(section.id)).toBe(section);
    }
  });

  it('falls back to the first section for a missing or unknown value', () => {
    const first = SETTINGS_SECTIONS[0];
    expect(settingsSection(null)).toBe(first);
    expect(settingsSection(undefined)).toBe(first);
    expect(settingsSection('')).toBe(first);
    expect(settingsSection('billing')).toBe(first);
    expect(settingsSection('MAIL')).toBe(first);
  });

  it('opens on Appearance', () => {
    expect(SETTINGS_SECTIONS[0].id).toBe('appearance');
  });

  it('gives every section its own id and label', () => {
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.id)).size).toBe(
      SETTINGS_SECTIONS.length,
    );
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.label)).size).toBe(
      SETTINGS_SECTIONS.length,
    );
  });
});

describe('settingsSectionPath', () => {
  it('is the Settings route with the section as a query value', () => {
    expect(settingsSectionPath('mail')).toBe('/settings?section=mail');
    expect(settingsSectionPath('sign-in')).toBe('/settings?section=sign-in');
  });

  it('round-trips through settingsSection', () => {
    for (const section of SETTINGS_SECTIONS) {
      const id = new URLSearchParams(settingsSectionPath(section.id).split('?')[1]).get('section');
      expect(settingsSection(id)).toBe(section);
    }
  });
});
