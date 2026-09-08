# Uni Pilot

Ein persönliches Betriebssystem für das Studium — Desktop-App auf Basis von Tauri 2, React, TypeScript, Vite und Tailwind CSS.

> **Status:** Fundament. App-Shell, Navigation, Routing und Design-System stehen. Fachliche Funktionen (Kalender, Aufgaben, Noten, ECTS …) sind noch nicht implementiert.

---

## Download

**[→ Neueste Version herunterladen](https://github.com/rbatmaz69/Uni-Pilot/releases/latest)**

| System                | Datei              | Hinweis                                             |
| --------------------- | ------------------ | --------------------------------------------------- |
| macOS                 | `…_universal.dmg`  | Läuft auf Apple Silicon und Intel                   |
| Windows               | `…-setup.exe`      | Empfohlen. Alternativ `.msi` für verwaltete Rechner |
| Linux (Debian/Ubuntu) | `…_amd64.deb`      | `sudo apt install ./datei.deb`                      |
| Linux (Fedora/RHEL)   | `…_x86_64.rpm`     | `sudo dnf install ./datei.rpm`                      |
| Linux (universell)    | `…_amd64.AppImage` | `chmod +x` nicht vergessen                          |

### Beim ersten Start

Die App ist derzeit **nicht signiert** — dafür braucht es eine kostenpflichtige Apple-Developer-Mitgliedschaft bzw. ein Windows-Code-Signing-Zertifikat. Betriebssysteme warnen deshalb beim ersten Öffnen. Das ist erwartbar und einmalig:

**macOS**

1. DMG öffnen, „Uni Pilot" in den Programme-Ordner ziehen.
2. Rechtsklick auf die App → **Öffnen** → im Dialog nochmals **Öffnen**.
3. Falls das unter macOS 15 (Sequoia) oder neuer nicht greift: _Systemeinstellungen → Datenschutz & Sicherheit_ → ganz unten **„Trotzdem öffnen"**.

Alternativ im Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Uni Pilot.app"
```

**Windows**

SmartScreen meldet einen unbekannten Herausgeber → **Weitere Informationen** → **Trotzdem ausführen**.

**Linux**

Das AppImage braucht auf Ubuntu 22.04 und neuer die FUSE-Kompatibilitätsbibliothek:

```bash
sudo apt install libfuse2 && chmod +x Uni*.AppImage && ./Uni*.AppImage
```

---

## Entwicklung

```bash
npm install
npm run dev          # Web-Vorschau auf http://localhost:1420
npm run tauri:dev    # Desktop-App (benötigt Rust)
```

Rust wird nur für die Desktop-Hülle gebraucht:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Skripte

| Skript                | Zweck                                          |
| --------------------- | ---------------------------------------------- |
| `npm run dev`         | Vite-Dev-Server                                |
| `npm run build`       | Typecheck, dann Produktions-Build nach `dist/` |
| `npm run typecheck`   | `tsc --noEmit`                                 |
| `npm run tauri:dev`   | Desktop-App gegen den Dev-Server               |
| `npm run tauri:build` | Desktop-App lokal bündeln                      |

### Tests und Codequalität

```bash
npm run check          # Typecheck + Lint + Format + Tests (das prüft auch CI)
npm run test           # Tests einmalig
npm run test:watch     # Tests im Watch-Modus
npm run test:coverage  # mit Abdeckungsbericht
npm run lint:fix       # behebbare Lint-Fehler beheben
npm run format         # Formatierung anwenden
```

Tests liegen neben ihrer Quelldatei. Der wichtigste ist `src/app/routes.test.tsx`: er iteriert über
`NAV_ITEMS` und stellt sicher, dass jeder Navigationseintrag auch wirklich eine Route hat — neue
Einträge sind damit automatisch abgedeckt.

### Struktur

```
src/
  app/          App-Root, Provider, Routen-Tabelle
  components/
    ui/         Button, IconButton, Tooltip, PageHeader
    layout/     AppLayout, Sidebar, Header, MainContent, Page
    navigation/ NavigationItem, NavigationSection
  pages/        Eine schlanke Komponente pro Route
  hooks/        Plattform-Modifier, aktive Route, Tastenkürzel
  lib/          Navigations-Konfiguration, Tone-Map, Klassen-Helper
  store/        Zustand-Store für UI-State (Sidebar, Theme)
  styles/       Design-Tokens + Tailwind-Bridge
  types/        Gemeinsame Typen
src-tauri/      Tauri-2-Desktop-Hülle
design/         Design-Referenz (Mockup)
```

### Design-System

Alle Farb-, Radius- und Schattenwerte liegen als semantische CSS-Variablen in
`src/styles/globals.css` und werden über `@theme inline` in Tailwind gespiegelt.
Ein weiteres Theme bedeutet: denselben Token-Block unter einem anderen
`[data-theme]`-Selektor neu deklarieren — keine Komponente muss angefasst werden.

### Navigation

`src/lib/navigation.ts` ist die einzige Quelle für Routen, Labels, Untertitel,
Icons und Akzentfarben. Sidebar, Header-Titel und jede Seite lesen daraus, damit
sie nicht auseinanderlaufen können.

---

## Release erstellen

Die Version steht nur in `package.json` — `src-tauri/tauri.conf.json` liest sie von dort.

```bash
npm version patch          # erzeugt Commit + Tag, z. B. v0.1.1
git push origin main --follow-tags
```

Der Tag startet den Workflow [`release.yml`](.github/workflows/release.yml): macOS, Linux und Windows werden parallel gebaut und in **denselben Entwurf** eines GitHub-Releases gelegt. Danach unter _Releases_ die Dateien prüfen und auf **Publish release** klicken.

Zum Testen ohne Veröffentlichung: _Actions → Release → Run workflow_. Dann entsteht kein Release, die Installer landen als Job-Artefakte.
