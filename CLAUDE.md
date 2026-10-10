# Uni Pilot — Arbeitshinweise

Desktop-App für das Studium: Tauri 2 + React 19 + TypeScript + Vite + Tailwind v4.
Stand: App-Shell mit Navigation und Routing, erste fachliche Features (Kalender, Dashboard,
Reminders) in Arbeit.

## Vor jedem Push

```bash
npm run check
```

Führt Typecheck, ESLint, Prettier und die Tests aus — exakt das, was CI prüft.
Bei Formatierungsfehlern: `npm run format`. Bei Lint-Fehlern: `npm run lint:fix`.

## Regeln

- **`src/lib/navigation.ts` ist die einzige Quelle** für Routen, Labels, Untertitel, Icons und
  Akzentfarben. Icon-Leiste, Tab-Titel und Seiten lesen ausschließlich daraus.
- **Neuer Navigationseintrag = auch neue `<Route>`** in `src/app/routes.tsx`. Der tabellengetriebene
  Test in `src/app/routes.test.tsx` iteriert über `NAV_ITEMS` und schlägt sonst automatisch fehl.
- **Neues Verhalten bringt seinen Test mit.** Tests liegen neben der Quelldatei (`*.test.ts[x]`).
  Für Tests über den ganzen Shell den Helfer `renderApp(pfad)` aus `src/test/render.tsx` nutzen —
  `AppProviders` taugt dafür nicht, weil es fest `BrowserRouter` verwendet.
- **Keine hartkodierten Farben, Radien oder Schatten.** Alles sind semantische Tokens in
  `src/styles/globals.css`, über `@theme inline` als Tailwind-Utilities verfügbar
  (`bg-surface`, `text-muted`, `border-line`, `rounded-xl` …).
- **Das Fenster hat vier Ebenen, von hinten nach vorn:** Rahmen (`.app-frame`, Verlauf aus
  `--frame-from`/`--frame-to`; Icon-Leiste und Titelleisten liegen direkt darauf), Panel
  (`--panel`, die Seitenleiste eines Bereichs), Karte (`--surface`, `.workspace`, mit
  `--frame-line` als Haarlinie) und Canvas (`--canvas` = `--page-backdrop`, Hintergrund von
  Boards und Seiten in der Karte). Neue Flächen nehmen diese Tokens statt eigener Grautöne,
  in allen vier Themes. Documents zeichnet Seitenleiste und Karte selbst, dort ist
  `.workspace` mit `data-frame='none'` unsichtbar.
- **Komponenten brauchen Accessible Names.** Icon-Buttons bekommen `aria-label`, Landmarks werden
  benannt. Die Tests greifen über Rollen und Namen zu, nicht über `data-testid`.
- **Notizen sind Markdown-Dateien.** Der Editor-Schema-Aufbau steht in
  `src/features/documents/lib/markdown.ts` (`noteExtensions`). Eine neue Tiptap-Extension
  ohne Markdown-Spec wird beim Speichern stillschweigend verworfen — jede Erweiterung bringt
  einen Roundtrip-Test in `markdown.test.ts` mit.
- **Eigene Block-Tokenizer melden ihren Start über `lineStart()`** aus
  `src/features/documents/lib/markdownTokens.ts`: marked übergibt `start` den Text ab dem
  zweiten Zeichen, `^` mit `m`-Flag träfe sonst escapte Syntax wie `\$$`. Zeichen, die neue
  Syntax öffnen könnten (z. B. `$` für Formeln), escapt `escapeMarkdownText` in `markdown.ts`.
- **Editor-Erweiterungen ohne Schema gehören nicht in `noteExtensions`.** Reine Dekorationen und
  Plugins (Fokusmodus, Suche im Dokument, `/`-Menü) hängt `StudyEditor` an. Sie dürfen den
  Dokumentinhalt nie verändern. Seitenstil (Schrift, Breite, Hintergrund) ist App-Einstellung im
  `noteStyleStore` und wird nie in die Datei geschrieben.
- **Sidebar-Anpassungen leben im `sidebarStore`** (`src/store/sidebarStore.ts`): Reihenfolge,
  ausgeblendete Einträge und Favoriten. `NAV_SECTIONS` bleibt der
  Standard, `arrangeSections` in `src/lib/sidebar.ts` legt die Nutzeränderungen darüber.
  Favoriten sind Pfade relativ zu Documents: Wer Dateien verschiebt oder umbenennt, ruft
  `relocateFavorites`, wer sie löscht, `forgetFavorites` — sonst zeigen Favoriten ins Leere.
- **Tabs wie im Browser, auf jeder Seite.** Über Seitenleiste und Karte liegt die Titelleiste
  (`TitleBar`: Zurück/Vor, Tabs, „+“, Suche). Der Router bleibt die Wahrheit, was das Fenster
  zeigt; `tabStore` merkt sich pro Tab die besuchten Adressen. `TabSync` schreibt jede
  Router-Adresse in den offenen Tab und führt Tab-Aktionen (`request`) aus. Tabs wechseln,
  schließen, Zurück/Vor, neuer Tab nur über `tabActions` (`src/lib/tabActions.ts`), nie direkt
  per `navigate`. Wer seinen Ort intern wechselt, ohne die Adresse zu ändern (Documents), meldet
  ihn mit `useTabStore.getState().visit({ location, title })` — Adresse aus `documentsHref`
  (`src/lib/sidebar.ts`), damit derselbe Ort immer dieselbe Adresse hat — und folgt umgekehrt
  dem `request`-Schlüssel seiner Seite. Im ILIAS-Modus und im Fokusmodus gibt es keine
  Titelleiste.
- **Die Shell ist Icon-Leiste → optionale Bereichs-Seitenleiste → Karte.** `Sidebar` ist immer
  die Icon-Leiste (Namen per Tooltip, keine ausklappbare Variante). Braucht ein Bereich eine
  eigene Seitenleiste, rendert die Seite irgendwo in ihrem Baum ein `SectionPanel`
  (`@/components/layout/SectionPanel`, per tiefem Import, nicht über das Barrel) aus den
  Bausteinen in `@/components/layout/Panel` (`PanelHeader`, `PanelBody`, `PanelSection`,
  `PanelItem`, `PanelFooter`); die Shell setzt es zwischen Icon-Leiste und Karte, allein
  gerendert (Tests) erscheint es inline. Ein-/Ausblenden ist eine App-Einstellung
  (`uiStore.panelOpen`); ausgeblendet werden die Kinder entfernt — Zustand gehört in den
  Elternteil. Mit `resize` (`PanelResize`) ist die Breite ziehbar und wird pro Panel in
  `uiStore.panelWidths` gespeichert; die Shell setzt sie als `--panel-width` auf die Spalte mit
  Titelleiste, damit die Tabs an der Panelkante bleiben. Mail nutzt das: dort ist die
  Nachrichtenliste selbst das Panel (`MailList`), die Karte zeigt die offene Nachricht.
  Panels gleiten beim Kommen und Gehen unter der Karte hervor bzw. darunter weg, mit gestuftem
  Blur (`panelMotion.ts`, echtes Layout per `margin-right`, Abgänge als inerte Kopie). Ein
  eigenes Panel-Element außerhalb von `SectionPanel` bekommt `ref={panelMotionRef}` (wie
  Documents' `SpaceSidebar`); ILIAS' Panel hat `motion={false}`. Die Titelleiste folgt über
  `--panel-span`; Dauer und Kurve stehen in `panelMotion.ts` und `globals.css` und bleiben gleich. Im ILIAS-Modus (`uiStore.iliasMode`) ist das Uni-Pilot-Webview nur die linke Spalte
  (Icon-Leiste + `IliasPanel`), ILIAS ist ein eigenes natives Webview rechts als Karte; beide
  überlappen nie (siehe `docs/ilias-window.md`). Größen in dieser Spalte dürfen nicht vom
  Viewport abhängen (`vw`, Media Queries) — `ilias.css` fixiert sie über `data-ilias-mode`,
  sonst schaukelt sich die Spaltenbreite auf. Documents zeichnet Seitenleiste (`SpaceSidebar`)
  und Karte selbst, auf denselben Bausteinen, unter der gemeinsamen Titelleiste. Favoriten nehmen dort Icon-Leiste und Favoriten-Tab an
  (`data-favorites-drop`).
- **TypeScript bleibt bei 5.9.** TypeScript 7 (nativer Compiler) exportiert die klassische
  Compiler-API nicht mehr, `typescript-eslint` verlangt aber `<6.1.0`. Erst hochziehen, wenn
  typescript-eslint TS 7 unterstützt.
- **Fachliche Features leben unter `src/features/<name>/`**, nicht unter `src/components/`.
  `src/components/` bleibt reserviert für generische, feature-übergreifende UI-Bausteine
  (`ui/`, `layout/`, `navigation/`). Jedes Feature gliedert sich intern nach Art des Codes:
  `components/` (UI), `store/` (Zustand-Stores des Features), `lib/` (Domänenlogik, Typen).
  Barrel-Exports (`index.ts`) und feature-weite Integrationstests (die `renderApp` nutzen und
  mehrere Units zusammen prüfen) liegen direkt in der Feature-Wurzel. Cross-Referenzen — auch
  innerhalb desselben Features über Unterordner hinweg — laufen über den `@/`-Alias
  (`@/features/calendar/store/eventStore`), nicht über relative `../`-Pfade.

## Struktur

```
src/app/          Root, Provider, Routen-Tabelle
src/components/   ui/ (Button, IconButton, ContextMenu, Modal, Tooltip, PageHeader)
                  layout/ (AppLayout, Sidebar, TitleBar, TabSync, MainContent, Page,
                  SectionPanel, Panel)
                  navigation/ (NavigationItem, NavigationSection, FavoritesSection,
                  CustomizeSidebarDialog)
src/features/     Ein Ordner pro fachlichem Feature, siehe Regel oben, z.B.:
                  calendar/  {components,store,lib}/ + index.ts
                  dashboard/ {components,lib}/ + index.ts
                  documents/ {components,lib}/ + index.ts
                  courses/   {components,store,lib}/ + index.ts — ILIAS-Kurse; Kursdateien
                             landen in Documents (siehe docs/integrations/ilias-course-files.md)
                  reminders/ {components,store,lib}/
                  settings/  {components,lib}/ + index.ts — Abschnitte der Einstellungen,
                             per `?section=` verlinkbar (`settingsSectionPath`)
                  auto-sign-in/ {components,store,lib}/ — HHN-Anmeldung durch Rust, opt-in,
                                auch per Gesicht (siehe docs/face-unlock-plan.md); Geheimnisse
                                und Gesichtsvorlage bleiben in Rust
                  integrations/ {components,store,lib}/ — ILIAS in der App (siehe
                                docs/ilias-window.md); SOAP-Connector noch Prototyp
src/pages/        Eine schlanke Komponente pro Route
src/lib/          navigation.ts (Quelle der Wahrheit), sidebar.ts, date.ts, ics.ts, tone.ts, utils.ts
src/store/        Zustand-Stores, nur UI-State (App-weit, nicht feature-spezifisch): uiStore,
                  sidebarStore, tabStore
src/test/         setup.ts, render.tsx
src-tauri/        Desktop-Hülle (Rust)
docs/             Technische Dokumentation, u.a. integrations/
scripts/          Eigenständige Node-Skripte, nicht Teil des Bundles
```

## Release

Version steht nur in `package.json`; `src-tauri/tauri.conf.json` liest sie von dort.

```bash
npm version patch && git push origin main --follow-tags
```

Der Tag startet `release.yml`: erst die Qualitätsprüfung, dann Builds für macOS, Linux und Windows
in einen Draft-Release. Details im README.
