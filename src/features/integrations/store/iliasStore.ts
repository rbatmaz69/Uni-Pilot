/**
 * The ILIAS installation this Uni Pilot is connected to.
 *
 * One at a time: a student is enrolled at one university, and the ILIAS window
 * holds one sign-in. Persisted like the calendar sources, with the same rule —
 * nothing secret goes in here. The sign-in itself lives only in the cookies of
 * the ILIAS window, so "connecting" never asks for a password and this store
 * never sees one.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  discoverInstallation,
  toConnection,
  type IliasConnection,
} from '@/features/integrations/lib/ilias/connection';
import { normaliseBaseUrl } from '@/features/integrations/lib/ilias/endpoints';
import { knownInstallationFor } from '@/features/integrations/lib/ilias/knownInstallations';
import { httpTransport } from '@/features/integrations/lib/ilias/transport';

interface IliasState {
  connection: IliasConnection | null;
  busy: boolean;
  /**
   * Finds out what is at an address and keeps it. Throws with a readable
   * message when there is nothing usable there; the caller shows it as is.
   */
  connect: (rawUrl: string) => Promise<IliasConnection>;
  /** Asks the installation again — after a university upgrade, say. */
  recheck: () => Promise<void>;
  disconnect: () => void;
}

function nameFor(baseUrl: string): string {
  const known = knownInstallationFor(baseUrl);
  if (known) return known.name;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export const useIliasStore = create<IliasState>()(
  persist(
    (set, get) => ({
      connection: null,
      busy: false,

      connect: async (rawUrl) => {
        const baseUrl = normaliseBaseUrl(rawUrl);
        if (!baseUrl) throw new Error('Enter the address of your ILIAS first.');

        set({ busy: true });
        try {
          const installation = await discoverInstallation(baseUrl, httpTransport);
          const connection = toConnection(installation, nameFor(installation.baseUrl));
          set({ connection });
          return connection;
        } finally {
          set({ busy: false });
        }
      },

      recheck: async () => {
        const current = get().connection;
        if (!current || get().busy) return;

        set({ busy: true });
        try {
          const installation = await discoverInstallation(current.baseUrl, httpTransport);
          // A flaky network must not cost the student their connection, so a
          // failed recheck throws before anything is replaced.
          set({ connection: toConnection(installation, current.name) });
        } finally {
          set({ busy: false });
        }
      },

      disconnect: () => set({ connection: null }),
    }),
    {
      name: 'uni-pilot.ilias',
      partialize: (state) => ({ connection: state.connection }),
    },
  ),
);
