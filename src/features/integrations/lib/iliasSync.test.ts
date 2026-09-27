import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { IliasError } from '@/features/integrations/lib/ilias/errors';
import {
  downloadIliasFile,
  readIliasAssignments,
  readIliasContents,
  readIliasCourses,
  renewIliasSession,
  toIliasError,
  type IliasContentItem,
} from './iliasSync';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};

const INSTALLATION = { baseUrl: 'https://ilias.hs-heilbronn.de', clientId: 'iliashhn' };

beforeEach(() => {
  invoke.mockReset().mockResolvedValue([]);
});

describe('what the page asks Rust for', () => {
  /** Rust builds every address; the page names objects, never links. */
  it('names the installation and an object id, nothing more', async () => {
    await readIliasCourses(HHN);
    await readIliasContents(HHN, 'fold', '967851');
    await readIliasAssignments(HHN, '995478');
    await downloadIliasFile(HHN, '967852');
    await renewIliasSession(HHN);
    expect(invoke.mock.calls).toEqual([
      ['ilias_sync_courses', INSTALLATION],
      ['ilias_sync_contents', { ...INSTALLATION, container: 'fold', containerRefId: '967851' }],
      ['ilias_sync_assignments', { ...INSTALLATION, exerciseRefId: '995478' }],
      ['ilias_sync_download', { ...INSTALLATION, fileRefId: '967852' }],
      ['ilias_sync_reauth', INSTALLATION],
    ]);
  });

  it('hands on what Rust read', async () => {
    const file: IliasContentItem = {
      refId: '100121',
      parentRefId: '100120',
      providerType: 'file',
      title: 'Beispiel_DB',
      description: null,
      block: 'Inhalt',
      file: { suffix: 'backup', size: 51087, version: 3, updatedAt: '2025-09-15T08:41' },
      properties: ['backup', '49.89 KB', 'Version: 3', '15. Sep 2025, 08:41'],
    };
    invoke.mockResolvedValue([file]);
    await expect(readIliasContents(HHN, 'fold', '100120')).resolves.toEqual([file]);
  });
});

describe('when Rust gives nothing', () => {
  it('asks for a new sign-in when ILIAS has forgotten the student', async () => {
    invoke.mockRejectedValue({ kind: 'signedOut' });
    const failure = await readIliasCourses(HHN).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IliasError);
    expect((failure as IliasError).kind).toBe('session-expired');
  });

  it('keeps what Rust said for the diagnostics', () => {
    const error = toIliasError({
      kind: 'unreachable',
      message: 'ILIAS is busy (503). Try again later.',
    });
    expect(error.kind).toBe('network');
    expect(error.providerMessage).toBe('ILIAS is busy (503). Try again later.');
  });

  /** An unknown page after an ILIAS update must not look like "nothing new". */
  it('tells an unreadable page apart from an empty one', () => {
    expect(toIliasError({ kind: 'unrecognised', message: 'x' }).kind).toBe('unreadable-response');
    expect(toIliasError({ kind: 'refused', message: 'x' }).kind).toBe('provider-error');
  });

  it('copes with a failure it does not know', () => {
    const error = toIliasError('command ilias_sync_courses not found');
    expect(error.kind).toBe('provider-error');
    expect(error.providerMessage).toBe('command ilias_sync_courses not found');
  });
});
