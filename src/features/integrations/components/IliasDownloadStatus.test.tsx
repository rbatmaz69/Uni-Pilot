import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasDownload } from '@/features/integrations/lib/iliasBrowser';
import { useIliasBrowserStore } from '@/features/integrations/store/iliasBrowserStore';
import { IliasDownloadStatus } from './IliasDownloadStatus';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const show = (download: IliasDownload, onError = vi.fn()) => {
  useIliasBrowserStore.getState().record(download);
  render(<IliasDownloadStatus onError={onError} />);
  return onError;
};

const slides: IliasDownload = { id: 3, fileName: 'Folien.pdf', state: 'finished', openable: true };

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

describe('IliasDownloadStatus', () => {
  it('shows nothing before anything was downloaded', () => {
    const { container } = render(<IliasDownloadStatus onError={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says a download is still running, with nothing to open yet', () => {
    show({ ...slides, state: 'started' });
    expect(screen.getByRole('status')).toHaveTextContent('Downloading Folien.pdf…');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to open a saved document or show it in its folder', async () => {
    show(slides);

    await userEvent.click(screen.getByRole('button', { name: 'Open Folien.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show Folien.pdf in its folder' }));

    expect(invoke.mock.calls).toEqual([
      ['open_ilias_download', { id: 3 }],
      ['reveal_ilias_download', { id: 3 }],
    ]);
  });

  /** Anything that could run is only ever shown in its folder. */
  it('only shows a file it will not open', () => {
    show({ ...slides, fileName: 'setup.exe', openable: false });
    expect(screen.queryByRole('button', { name: 'Open setup.exe' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show setup.exe in its folder' }),
    ).toBeInTheDocument();
  });

  it('says when a download failed, and can be dismissed', async () => {
    show({ ...slides, state: 'failed' });
    expect(screen.getByRole('status')).toHaveTextContent('Folien.pdf could not be downloaded');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('passes on what went wrong opening a file', async () => {
    invoke.mockRejectedValue('The file is no longer there — it may have been moved or deleted.');
    const onError = show(slides);

    await userEvent.click(screen.getByRole('button', { name: 'Open Folien.pdf' }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'The file is no longer there — it may have been moved or deleted.',
      ),
    );
  });
});
