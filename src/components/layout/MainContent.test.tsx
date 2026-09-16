import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';

/**
 * The column each page is laid out in. Its width is the one layout decision
 * the shell makes on the page's behalf, so it is asserted here rather than in
 * every page: the geometry itself has no meaning in jsdom.
 */
const column = () => screen.getByRole('main').firstElementChild as HTMLElement;

describe('MainContent', () => {
  it('keeps an ordinary page in the centred reading column', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(column()).toHaveClass('max-w-[1600px]');
  });

  it('hands the calendar the whole window, so its side panel reaches the edge', () => {
    renderApp(NAV_ITEMS.calendar.path);

    expect(column()).toHaveClass('max-w-none');
  });
});
