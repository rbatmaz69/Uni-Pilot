import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePlatformModifier } from './usePlatform';

const setPlatform = (platform: string) => {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
};

afterEach(() => setPlatform(''));

describe('usePlatformModifier', () => {
  it('uses the command symbol on Apple platforms', () => {
    setPlatform('MacIntel');
    const { result } = renderHook(() => usePlatformModifier());

    expect(result.current.isMac).toBe(true);
    expect(result.current.label).toBe('⌘');
  });

  it('uses Ctrl everywhere else', () => {
    setPlatform('Win32');
    const { result } = renderHook(() => usePlatformModifier());

    expect(result.current.isMac).toBe(false);
    expect(result.current.label).toBe('Ctrl');
  });
});
