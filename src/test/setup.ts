import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useUiStore } from '@/store/uiStore';

afterEach(() => {
  cleanup();
  localStorage.clear();
  useUiStore.setState({ sidebarCollapsed: false, theme: 'light' });
});
