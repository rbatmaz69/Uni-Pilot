/**
 * ILIAS installations Uni Pilot can connect to in one click.
 *
 * Only the two things that never change live here: what the university is
 * called and where its ILIAS is. Release, client id and sign-in method are
 * deliberately absent — they are read fresh by `discoverInstallation()` every
 * time, so an upgrade at the university (Heilbronn moving to ILIAS 10 would
 * change its SOAP path) is noticed instead of contradicted by a stale entry.
 *
 * One entry for now, because the MVP has to work at one university. Adding the
 * next is a line here, not a change anywhere else.
 */

import { normaliseBaseUrl } from './endpoints';

export interface KnownInstallation {
  id: string;
  name: string;
  baseUrl: string;
}

export const KNOWN_INSTALLATIONS: readonly KnownInstallation[] = [
  { id: 'hhn', name: 'Hochschule Heilbronn', baseUrl: 'https://ilias.hs-heilbronn.de' },
];

/**
 * Names an address someone typed by hand, if it is one we know. Someone who
 * pastes a Heilbronn deep link should still see "Hochschule Heilbronn", not a
 * host name.
 */
export function knownInstallationFor(rawUrl: string): KnownInstallation | undefined {
  const wanted = normaliseBaseUrl(rawUrl);
  return KNOWN_INSTALLATIONS.find((known) => normaliseBaseUrl(known.baseUrl) === wanted);
}
