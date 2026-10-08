import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IliasFileDetails } from './IliasFileDetails';
import { documentRequest } from '@/features/documents/lib/files';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/features/documents/lib/files', async (original) => ({
  ...(await original<object>()),
  documentRequest: vi.fn(),
}));
vi.mock('./PdfPreview', () => ({ default: () => <div aria-label="PDF viewer" /> }));

const path = 'Courses/Winter 2026-27/Datenbanken/ILIAS/Blatt 6.pdf';
const selection = {
  kind: 'saved' as const,
  file: {
    refId: '123',
    name: 'Blatt 6.pdf',
    path,
    size: 2048,
    updatedAt: '2026-09-24T17:05',
    arrived: 0,
    course: {
      courseRefId: '7',
      title: '262009 Datenbanken 1 - WS26',
      root: 'Courses/Winter 2026-27/Datenbanken/ILIAS',
      syncedAt: null,
      unseen: 0,
      files: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(documentRequest).mockResolvedValue({ mime: 'application/pdf', base64: 'JVBERi0=' });
  vi.mocked(invoke).mockResolvedValue('Blatt 6.pdf');
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
});

describe('ILIAS file details', () => {
  it('previews the local PDF, exports it to Downloads, and links to the original file', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IliasFileDetails selection={selection} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    const panel = screen.getByLabelText('File details: Blatt 6.pdf');
    expect(await within(panel).findByLabelText('PDF viewer')).toBeInTheDocument();
    expect(documentRequest).toHaveBeenCalledWith({ action: 'preview', path });
    expect(within(panel).getByText('Datenbanken 1 - WS26')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Download' }));
    expect(invoke).toHaveBeenCalledWith('download_document', { path });
    expect(await within(panel).findByText('Blatt 6.pdf saved to Downloads')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Open file' }));
    expect(documentRequest).toHaveBeenCalledWith({ action: 'open', path });
    expect(within(panel).getByRole('button', { name: 'Open in ILIAS' })).toBeInTheDocument();
  });

  it('copies a deep link to the selected file', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IliasFileDetails selection={selection} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    const panel = screen.getByLabelText('File details: Blatt 6.pdf');
    await user.click(within(panel).getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(
      'https://ilias.hs-heilbronn.de/goto.php?target=file_123&client_id=iliashhn',
    );
  });
});

it('opens a downloaded ILIAS PDF in the existing note editor', async () => {
  const user = userEvent.setup();
  const edit = vi.fn();
  render(
    <MemoryRouter>
      <IliasFileDetails selection={selection} onClose={vi.fn()} onEdit={edit} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Im Notizeditor öffnen' }));
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({ path, folder: false }));
});
