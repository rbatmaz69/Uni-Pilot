import { describe, expect, it } from 'vitest';
import {
  IliasError,
  fromHttpStatus,
  fromNetworkFailure,
  fromSoapFault,
  needsUniversityAction,
} from './errors';

describe('fromSoapFault', () => {
  // `err_wrong_login` is what demo.ilias.de answered to a deliberately wrong
  // password; ILIAS returns the language key rather than a sentence.
  it('recognises the rejected-credentials key ILIAS actually sends', () => {
    const error = fromSoapFault('err_wrong_login');
    expect(error.kind).toBe('credentials-rejected');
    expect(error.providerMessage).toBe('err_wrong_login');
  });

  it('separates a switched-off SOAP interface from a failed sign-in', () => {
    expect(fromSoapFault('SOAP is not enabled in ILIAS administration for this client').kind).toBe(
      'soap-disabled',
    );
  });

  it('recognises an ended session', () => {
    expect(fromSoapFault('Session invalid').kind).toBe('session-expired');
    expect(fromSoapFault('No session id given').kind).toBe('session-expired');
  });

  it('recognises a permission refusal', () => {
    expect(fromSoapFault('No permission to edit the object with id: 717').kind).toBe(
      'permission-denied',
    );
    expect(fromSoapFault('Check access failed.').kind).toBe('permission-denied');
  });

  it('recognises a missing object', () => {
    expect(fromSoapFault('No File found for id: 999').kind).toBe('not-found');
    expect(fromSoapFault('Object with ID 12 has been deleted.').kind).toBe('not-found');
  });

  it('keeps an unrecognised fault instead of guessing', () => {
    const error = fromSoapFault('Trying to access array offset on value of type null');
    expect(error.kind).toBe('provider-error');
    expect(error.providerMessage).toBe('Trying to access array offset on value of type null');
  });
});

describe('fromHttpStatus', () => {
  // The Heilbronn installation answers 403 here: the path exists and a web
  // server rule refuses it, which is what ILIAS's hardening guide recommends.
  it('reads 403 as an endpoint the university blocks, not a missing one', () => {
    expect(fromHttpStatus(403).kind).toBe('endpoint-blocked');
  });

  it('reads 404 as no SOAP interface at that address', () => {
    expect(fromHttpStatus(404).kind).toBe('endpoint-missing');
  });

  it('reads a server error as coming from the provider', () => {
    expect(fromHttpStatus(500).kind).toBe('provider-error');
  });
});

describe('fromNetworkFailure', () => {
  it('keeps the underlying cause without putting it in front of the user', () => {
    const error = fromNetworkFailure(new Error('getaddrinfo ENOTFOUND ilias.example'));
    expect(error.kind).toBe('network');
    expect(error.message).not.toContain('ENOTFOUND');
    expect(error.providerMessage).toContain('ENOTFOUND');
  });
});

describe('needsUniversityAction', () => {
  it('is true only for the failures a student cannot resolve', () => {
    expect(needsUniversityAction(fromHttpStatus(403))).toBe(true);
    expect(needsUniversityAction(fromSoapFault('SOAP is not enabled'))).toBe(true);
    expect(needsUniversityAction(fromSoapFault('err_wrong_login'))).toBe(false);
    expect(needsUniversityAction(new IliasError('network', 'offline'))).toBe(false);
  });
});
