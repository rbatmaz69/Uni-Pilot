import { fileURLToPath, URL } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const MIME_TYPES: Record<string, string> = {
  wasm: 'application/wasm',
  js: 'text/javascript',
  woff2: 'font/woff2',
};

/**
 * Keeps assets that libraries would otherwise fetch at runtime available
 * offline in both runtimes: PDF fonts, character maps and decoders, and the
 * drawing board's fonts, which Excalidraw loads from a CDN by default.
 */
function offlineAssets(): Plugin {
  const assets = new Map<string, { bytes: Buffer; mime: string }>();
  const add = (source: string, target: string, skip?: (file: string) => boolean) => {
    const root = new URL(source, import.meta.url);
    for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
      const location = new URL(file, root);
      if (skip?.(file) || !statSync(location).isFile()) continue;
      assets.set(`${target}${file.replaceAll('\\', '/')}`, {
        bytes: readFileSync(location),
        mime: MIME_TYPES[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream',
      });
    }
  };
  for (const directory of ['cmaps', 'standard_fonts', 'wasm'])
    add(`./node_modules/pdfjs-dist/${directory}/`, `/pdfjs/${directory}/`);
  // Xiaolai only covers Chinese, Japanese and Korean handwriting and is 12 MB;
  // those scripts fall back to a system font instead.
  add('./node_modules/@excalidraw/excalidraw/dist/prod/fonts/', '/excalidraw/fonts/', (file) =>
    file.startsWith('Xiaolai'),
  );
  return {
    name: 'uni-pilot:offline-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.get((request.url ?? '').split('?')[0] ?? '');
        if (!asset) return next();
        response.setHeader('Content-Type', asset.mime);
        response.end(asset.bytes);
      });
    },
    generateBundle() {
      for (const [path, asset] of assets) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: asset.bytes });
      }
    },
  };
}

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
  plugins: [react(), tailwindcss(), icsDevProxy(), offlineAssets()],
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
