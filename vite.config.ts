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

export default defineConfig({
  plugins: [react(), tailwindcss(), icsDevProxy()],
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
