/**
 * How a request actually leaves the app.
 *
 * ILIAS installations send no CORS headers and the webview runs on its own
 * origin, so a plain browser request is refused before it goes anywhere. In
 * the desktop app the request is made by Rust through `tauri-plugin-http`,
 * where the same-origin policy does not apply — the same arrangement
 * `src/lib/icsFetch.ts` already uses for calendar feeds, and the runtime check
 * is imported from there rather than written twice.
 *
 * Everything that talks to ILIAS takes a `Transport`, so tests can hand it a
 * function instead of a network.
 */

import { isDesktopRuntime } from '@/lib/icsFetch';
import { fromNetworkFailure } from './errors';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Readonly<Record<string, string>>;
  /**
   * Defaults to 'manual', because for most of these calls the status code is
   * the answer — a 403 from a SOAP endpoint means something a 200 from the
   * login page it redirects to would hide. Reading a page is the exception.
   */
  redirect?: 'follow' | 'manual';
}

export interface HttpResponse {
  status: number;
  text: string;
  /** Lower-cased header names. Only what the callers need; not the whole set. */
  headers: Readonly<Record<string, string>>;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

/** Long enough for a loaded university server, short enough to not hang the UI. */
const TIMEOUT_MS = 30_000;

const INTERESTING_HEADERS = ['content-type', 'www-authenticate'] as const;

export const httpTransport: Transport = async ({
  url,
  method = 'GET',
  body,
  headers = {},
  redirect = 'manual',
}) => {
  const request = await resolveFetch();

  let response: Response;
  try {
    response = await request(url, {
      method,
      headers,
      redirect,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(body === undefined ? {} : { body }),
    });
  } catch (cause) {
    throw fromNetworkFailure(cause);
  }

  const collected: Record<string, string> = {};
  for (const name of INTERESTING_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) collected[name] = value;
  }

  return { status: response.status, text: await response.text(), headers: collected };
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function resolveFetch(): Promise<FetchLike> {
  if (isDesktopRuntime()) {
    const { fetch: desktopFetch } = await import('@tauri-apps/plugin-http');
    // Unverified: whether the plugin honours `redirect: 'manual'` has not been
    // checked in a packaged build. If it follows redirects anyway, discovery
    // would read a 403 endpoint as whatever page it redirects to — so that is
    // worth confirming before relying on the distinction on the desktop.
    return desktopFetch;
  }
  // In a browser tab this reaches ILIAS only if the installation happens to
  // send CORS headers, which none do. It is kept so the module is usable in
  // tests and in the dev server without branching at every call site.
  return (url, init) => fetch(url, init);
}

/** Builds an HTTP Basic header. Used by the private news feed, and only there. */
export function basicAuthHeader(username: string, password: string): string {
  const encoded =
    typeof btoa === 'function'
      ? btoa(`${username}:${password}`)
      : Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}
