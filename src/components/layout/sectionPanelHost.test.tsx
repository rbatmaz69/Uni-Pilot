import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useUiStore } from '@/store/uiStore';
import { AppLayout } from './AppLayout';
import { SectionPanel } from './SectionPanel';
import {
  SectionPanelHostContext,
  useSectionPanelHost,
  useSectionPanelShown,
  type SectionPanelHost,
} from './sectionPanelHost';

const shell: SectionPanelHost = {
  slot: null,
  claim: () => () => {},
  present: true,
  width: null,
  setWidth: () => {},
};
const inShell = ({ children }: { children: ReactNode }) => (
  <SectionPanelHostContext.Provider value={shell}>{children}</SectionPanelHostContext.Provider>
);

function Probe() {
  return <p>{useSectionPanelShown() ? 'panel shown' : 'panel hidden'}</p>;
}

describe('useSectionPanelHost', () => {
  it('is null outside the shell', () => {
    expect(renderHook(() => useSectionPanelHost()).result.current).toBeNull();
  });
});

describe('useSectionPanelShown', () => {
  it('is true outside the shell, where the panel renders in place', () => {
    useUiStore.setState({ panelOpen: false, iliasMode: false });

    expect(renderHook(() => useSectionPanelShown()).result.current).toBe(true);
  });

  it('follows the stored preference inside the shell', () => {
    const { result } = renderHook(() => useSectionPanelShown(), { wrapper: inShell });
    expect(result.current).toBe(true);

    act(() => {
      useUiStore.setState({ panelOpen: false });
    });
    expect(result.current).toBe(false);

    act(() => {
      useUiStore.setState({ panelOpen: true });
    });
    expect(result.current).toBe(true);
  });

  it('stays true in ILIAS mode, whatever the student chose', () => {
    useUiStore.setState({ panelOpen: false, iliasMode: true });

    expect(renderHook(() => useSectionPanelShown(), { wrapper: inShell }).result.current).toBe(
      true,
    );
  });

  it('agrees with the SectionPanel the shell actually renders', () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/demo"
              element={
                <>
                  <SectionPanel label="Demo panel">Rows</SectionPanel>
                  <Probe />
                </>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('complementary', { name: 'Demo panel' })).toBeInTheDocument();
    expect(screen.getByText('panel shown')).toBeInTheDocument();

    act(() => {
      useUiStore.setState({ panelOpen: false });
    });
    expect(screen.queryByRole('complementary', { name: 'Demo panel' })).toBeNull();
    expect(screen.getByText('panel hidden')).toBeInTheDocument();

    act(() => {
      useUiStore.setState({ iliasMode: true });
    });
    expect(screen.getByRole('complementary', { name: 'Demo panel' })).toBeInTheDocument();
    expect(screen.getByText('panel shown')).toBeInTheDocument();
  });
});
