# Uni Pilot — Arbeitshinweise

Desktop-App für das Studium: Tauri 2 + React 19 + TypeScript + Vite + Tailwind v4.
Stand: App-Shell mit Navigation, Routing und Design-System. **Noch keine fachlichen Features.**

## Vor jedem Push

```bash
npm run check
```

Führt Typecheck, ESLint, Prettier und die Tests aus — exakt das, was CI prüft.
Bei Formatierungsfehlern: `npm run format`. Bei Lint-Fehlern: `npm run lint:fix`.

## Regeln

- **`src/lib/navigation.ts` ist die einzige Quelle** für Routen, Labels, Untertitel, Icons und
  Akzentfarben. Sidebar, Header-Titel und Seiten lesen ausschließlich daraus.
- **Neuer Navigationseintrag = auch neue `<Route>`** in `src/app/routes.tsx`. Der tabellengetriebene
  Test in `src/app/routes.test.tsx` iteriert über `NAV_ITEMS` und schlägt sonst automatisch fehl.
- **Neues Verhalten bringt seinen Test mit.** Tests liegen neben der Quelldatei (`*.test.ts[x]`).
  Für Tests über den ganzen Shell den Helfer `renderApp(pfad)` aus `src/test/render.tsx` nutzen —
  `AppProviders` taugt dafür nicht, weil es fest `BrowserRouter` verwendet.
- **Keine hartkodierten Farben, Radien oder Schatten.** Alles sind semantische Tokens in
  `src/styles/globals.css`, über `@theme inline` als Tailwind-Utilities verfügbar
  (`bg-surface`, `text-muted`, `border-line`, `rounded-xl` …).
- **Komponenten brauchen Accessible Names.** Icon-Buttons bekommen `aria-label`, Landmarks werden
  benannt. Die Tests greifen über Rollen und Namen zu, nicht über `data-testid`.
- **TypeScript bleibt bei 5.9.** TypeScript 7 (nativer Compiler) exportiert die klassische
  Compiler-API nicht mehr, `typescript-eslint` verlangt aber `<6.1.0`. Erst hochziehen, wenn
  typescript-eslint TS 7 unterstützt.

## Struktur

```
src/app/          Root, Provider, Routen-Tabelle
src/components/   ui/ (Button, IconButton, Tooltip, PageHeader)
                  layout/ (AppLayout, Sidebar, Header, MainContent, Page)
                  navigation/ (NavigationItem, NavigationSection)
src/pages/        Eine schlanke Komponente pro Route
src/lib/          navigation.ts (Quelle der Wahrheit), tone.ts, utils.ts
src/store/        Zustand-Store, nur UI-State
src/test/         setup.ts, render.tsx
src-tauri/        Desktop-Hülle (Rust)
```

## Release

Version steht nur in `package.json`; `src-tauri/tauri.conf.json` liest sie von dort.

```bash
npm version patch && git push origin main --follow-tags
```

Der Tag startet `release.yml`: erst die Qualitätsprüfung, dann Builds für macOS, Linux und Windows
in einen Draft-Release. Details im README.
