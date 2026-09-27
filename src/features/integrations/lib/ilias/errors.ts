/**
 * Turns what an ILIAS installation answers into something the UI can act on.
 *
 * The distinctions here are not cosmetic. "SOAP is switched off in the
 * administration" and "the web server refuses the endpoint" both look like a
 * failed request, but the first is a checkbox a university admin can tick and
 * the second needs a firewall change — and the student can do nothing about
 * either, so the app has to say which one it is.
 */

export type IliasFailureKind =
  /** The URL is not an ILIAS installation, or SOAP lives somewhere else. */
  | 'endpoint-missing'
  /** The endpoint exists and something in front of it refuses the request. */
  | 'endpoint-blocked'
  /** Reachable, but `soap_user_administration` is off for this client. */
  | 'soap-disabled'
  /** Username or password rejected. */
  | 'credentials-rejected'
  /** The session id is no longer valid. */
  | 'session-expired'
  /** Authenticated, but not allowed to read this object. */
  | 'permission-denied'
  /** The object is gone, or never existed. */
  | 'not-found'
  /** The request never completed: offline, DNS, TLS, timeout. */
  | 'network'
  /** ILIAS answered with something this connector cannot read. */
  | 'unreadable-response'
  /** An ILIAS fault that does not map to anything more specific. */
  | 'provider-error';

export class IliasError extends Error {
  readonly kind: IliasFailureKind;
  /** The provider's own wording, kept for the diagnostics view and logs. */
  readonly providerMessage: string | null;

  constructor(kind: IliasFailureKind, message: string, providerMessage: string | null = null) {
    super(message);
    this.name = 'IliasError';
    this.kind = kind;
    this.providerMessage = providerMessage;
  }
}

/**
 * Faults arrive as ILIAS language keys (`err_wrong_login`) or as English
 * sentences, depending on which layer raised them, so both are matched.
 */
const FAULT_PATTERNS: readonly [RegExp, IliasFailureKind, string][] = [
  [
    /soap is not enabled/i,
    'soap-disabled',
    'This ILIAS has the SOAP interface switched off. A university administrator has to enable it.',
  ],
  [
    /err_wrong_login|wrong (login|password)|authentication failed/i,
    'credentials-rejected',
    'ILIAS did not accept that username and password.',
  ],
  [
    /session (invalid|expired)|no session id given|not authenticated/i,
    'session-expired',
    'The ILIAS session has ended. Sign in again.',
  ],
  [
    /no permission|check access failed|permission denied/i,
    'permission-denied',
    'That ILIAS account may not read this object.',
  ],
  [
    /no .* found for id|has been deleted|does not exist|wrong (obj id|type)/i,
    'not-found',
    'ILIAS has no such object any more.',
  ],
];

/** Maps a `<faultstring>` to a typed failure. */
export function fromSoapFault(fault: string): IliasError {
  for (const [pattern, kind, message] of FAULT_PATTERNS) {
    if (pattern.test(fault)) return new IliasError(kind, message, fault);
  }
  return new IliasError('provider-error', 'ILIAS refused the request.', fault);
}

/**
 * Maps a transport-level answer. `403` is the interesting one: ILIAS's own
 * hardening guide tells administrators to restrict the SOAP endpoint to known
 * hosts, so a blocked endpoint is the expected state at a careful university,
 * not a misconfiguration to work around.
 */
export function fromHttpStatus(status: number): IliasError {
  if (status === 404) {
    return new IliasError(
      'endpoint-missing',
      'No SOAP interface at that address. Check the ILIAS address, or the installation may be on a release that keeps it elsewhere.',
    );
  }
  if (status === 401 || status === 403) {
    return new IliasError(
      'endpoint-blocked',
      'The ILIAS server refuses this interface from outside its network. Only the university can allow Uni Pilot through.',
    );
  }
  if (status >= 500) {
    return new IliasError('provider-error', `ILIAS answered with an error (${status}).`);
  }
  return new IliasError('provider-error', `ILIAS answered with ${status}.`);
}

export function fromNetworkFailure(cause: unknown): IliasError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new IliasError('network', 'Could not reach that ILIAS installation.', detail);
}

/**
 * True when a failure is the university's to fix rather than the student's.
 * The UI uses this to stop offering a "try again" button that cannot work.
 */
export function needsUniversityAction(error: IliasError): boolean {
  return error.kind === 'endpoint-blocked' || error.kind === 'soap-disabled';
}
