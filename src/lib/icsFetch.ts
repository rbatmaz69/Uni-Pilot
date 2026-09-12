/**
 * Retrieval half of calendar subscriptions.
 *
 * University feeds almost never send CORS headers, and the webview runs on its
 * own `tauri://` origin, so a plain browser request to one is refused before it
 * leaves. In the desktop app the request is made by Rust through
 * `tauri-plugin-http`, where same-origin policy does not apply. In a plain
 * browser tab the normal `fetch` is used, which works for feeds that do send
 * the headers and fails with an explanation for the rest.
 */

const CALENDAR_MARKER = 'BEGIN:VCALENDAR';
const MAX_BYTES = 8 * 1024 * 1024;

/** True when running inside the Tauri shell rather than a browser tab. */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Accepts `webcal://`, a bare host, or a full URL, and returns something fetchable. */
export function normaliseIcsUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^webcal:\/\//i.test(trimmed)) return `https://${trimmed.slice('webcal://'.length)}`;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function describeIcsHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function fetchIcsText(url: string): Promise<string> {
  const response = await request(url);

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'The server has no calendar at that address (404).'
        : `The server answered with ${response.status}. Check whether the link needs a login.`,
    );
  }

  const text = await response.text();

  if (text.length > MAX_BYTES) {
    throw new Error('That calendar is too large to import.');
  }
  if (!text.includes(CALENDAR_MARKER)) {
    throw new Error('That link returned a page rather than a calendar file.');
  }

  return text;
}

async function request(url: string): Promise<Response> {
  if (isDesktopRuntime()) {
    const { fetch: desktopFetch } = await import('@tauri-apps/plugin-http');
    return desktopFetch(url, { method: 'GET', headers: { Accept: 'text/calendar' } });
  }

  try {
    return await fetch(url, { headers: { Accept: 'text/calendar' } });
  } catch {
    // A CORS refusal lands here. During `npm run dev` the Vite server will
    // relay the request, which is the only way to try a real feed from a
    // browser tab; the packaged app never gets this far.
    if (import.meta.env.DEV) {
      try {
        return await fetch(`/__ics?url=${encodeURIComponent(url)}`);
      } catch {
        // Fall through to the explanation below.
      }
    }
    throw new Error(
      'The browser blocked that request. Subscriptions work in the desktop app, which fetches the feed itself.',
    );
  }
}
