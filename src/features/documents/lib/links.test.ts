import { describe, expect, it } from 'vitest';
import { normaliseHref } from './links';

describe('link field', () => {
  it.each([
    ['uni.de', 'https://uni.de'],
    ['  www.hs-heilbronn.de/mensa ', 'https://www.hs-heilbronn.de/mensa'],
    ['http://example.com', 'http://example.com'],
    ['mailto:prof@uni.de', 'mailto:prof@uni.de'],
    ['prof@uni.de', 'mailto:prof@uni.de'],
    ['#variance', '#variance'],
    ['', ''],
  ])('turns %j into %j', (typed, href) => {
    expect(normaliseHref(typed)).toBe(href);
  });
});
