import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only bridge for calendar subscriptions.
 *
 * Timetable feeds send no CORS headers, so a browser tab cannot read one. The
 * packaged app fetches through tauri-plugin-http and never needs this; without
 * it, `npm run dev` in a browser could not test a real subscription at all.
 * Never reaches a build: `apply: 'serve'` keeps it out of production.
 */
function icsDevProxy(): Plugin {
  return {
    name: 'uni-pilot:ics-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ics', (request, response) => {
        const target = new URL(request.url ?? '', 'http://localhost').searchParams.get('url');
        const parsed = target && URL.canParse(target) ? new URL(target) : null;

        if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
          response.statusCode = 400;
          response.end('Pass a http(s) url.');
          return;
        }

        fetch(parsed, { headers: { Accept: 'text/calendar' } })
          .then(async (upstream) => {
            response.statusCode = upstream.status;
            response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            response.end(await upstream.text());
          })
          .catch((cause: unknown) => {
            response.statusCode = 502;
            response.end(cause instanceof Error ? cause.message : 'Upstream request failed.');
          });
      });
    },
  };
}

interface IliasProxyRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  redirect: 'follow' | 'manual';
}

/** The request headers ILIAS needs, and no others. */
const ILIAS_REQUEST_HEADERS = ['content-type', 'soapaction', 'accept', 'authorization'];
/** The response headers the ILIAS transport reads. */
const ILIAS_RESPONSE_HEADERS = ['content-type', 'www-authenticate'];

function readIliasProxyRequest(raw: string): IliasProxyRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  const url = typeof candidate.url === 'string' ? candidate.url : '';
  if (!URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)) return null;

  const headers: Record<string, string> = {};
  if (typeof candidate.headers === 'object' && candidate.headers !== null) {
    for (const [name, value] of Object.entries(candidate.headers)) {
      if (typeof value === 'string' && ILIAS_REQUEST_HEADERS.includes(name.toLowerCase())) {
        headers[name] = value;
      }
    }
  }

  return {
    url,
    method: candidate.method === 'POST' ? 'POST' : 'GET',
    headers,
    ...(typeof candidate.body === 'string' ? { body: candidate.body } : {}),
    redirect: candidate.redirect === 'follow' ? 'follow' : 'manual',
  };
}

/**
 * Dev-only bridge for the ILIAS connector — the same reason as the calendar
 * bridge above, but ILIAS needs more than a GET: SOAP is a POST with a body
 * and its own headers, and the connector has to see a 403 or a 302 as it is.
 *
 * So the answer comes back wrapped in JSON rather than as the upstream status.
 * A relayed redirect would be followed by the browser straight back into the
 * CORS wall, and a relayed 403 would be indistinguishable from the proxy
 * itself refusing. Wrapped, the connector gets exactly what ILIAS said.
 *
 * Without this, `npm run dev` could not connect to any ILIAS at all, and that
 * is the only way to try the ILIAS page without a Rust toolchain.
 * `apply: 'serve'` keeps it out of every build.
 */
function iliasDevProxy(): Plugin {
  return {
    name: 'uni-pilot:ilias-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ilias', (request, response) => {
        const reply = (status: number, payload: unknown) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
        };

        if (request.method !== 'POST') {
          reply(405, { error: 'POST a request description.' });
          return;
        }

        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const wanted = readIliasProxyRequest(Buffer.concat(chunks).toString('utf8'));
          if (!wanted) {
            reply(400, { error: 'Pass an http(s) url.' });
            return;
          }

          fetch(wanted.url, {
            method: wanted.method,
            headers: wanted.headers,
            redirect: wanted.redirect,
            ...(wanted.body === undefined ? {} : { body: wanted.body }),
          })
            .then(async (upstream) => {
              const headers: Record<string, string> = {};
              for (const name of ILIAS_RESPONSE_HEADERS) {
                const value = upstream.headers.get(name);
                if (value !== null) headers[name] = value;
              }
              reply(200, { status: upstream.status, headers, text: await upstream.text() });
            })
            .catch((cause: unknown) => {
              reply(502, { error: cause instanceof Error ? cause.message : 'Upstream failed.' });
            });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), icsDevProxy(), iliasDevProxy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/types/**'],
    },
  },
});
