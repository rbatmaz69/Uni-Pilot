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

### Lokale Dokumente

Die Seite **Documents** verwaltet echte Dateien unter `~/Documents/Uni Pilot` in der
Desktop-App. Ordner anlegen, Dateien importieren (bis 25 MB pro Datei), umbenennen,
verschieben und im Finder anzeigen funktioniert offline. Markdown- und Textdateien
(`.md`, `.markdown`, `.txt`, UTF-8, bis 2 MB) lassen sich direkt bearbeiten; andere
Dateien öffnen sich in ihrer Standard-App. Importe sind Kopien, die Originale bleiben
erhalten. Vorhandene Dateinamen werden nicht überschrieben.

**Speichern** passiert automatisch: kurz nach einer Tipppause, spätestens nach fünf
Sekunden Dauertippen, beim Verlassen der Notiz und wenn die App den Fokus verliert.
<kbd>⌘ S</kbd> / <kbd>Strg S</kbd> speichert sofort. Jeder Schreibvorgang übergibt den
zuletzt gelesenen Inhalt; hat eine andere App die Datei inzwischen geändert (Obsidian,
Cloud-Sync), pausiert das Speichern und ein Dialog bietet **Keep mine**, **Use the other
version** oder **Keep both** (Kopie „… (my version).md“). Ohne eigene
Änderungen übernimmt eine offene Notiz externe Änderungen beim Zurückkehren in die App.

Der Editor speichert **Markdown** über `@tiptap/markdown`, ergänzt um eine Schutzschicht
(`src/features/documents/lib/markdown.ts`): Zeilen, die nur wie Markdown-Syntax aussehen
(`1. Semester`, `# `, `---`), bleiben Text, `snake_case` und URLs bleiben lesbar, Pipes in
Tabellenzellen werden maskiert, YAML-Front-Matter bleibt unverändert. Würde das Speichern
Inhalt entfernen, den der Editor nicht darstellen kann (z. B. HTML oder Kommentare),
öffnet die Notiz schreibgeschützt. `.txt`-Dateien werden nie als Markdown interpretiert.

**Bilder** landen beim Einfügen oder Ablegen als Datei im Ordner `attachments/` neben der
Notiz und werden relativ verlinkt (`![](attachments/…png)`), wie in Obsidian oder Typora.
Beim Verschieben einer Notiz in einen anderen Ordner werden die verlinkten Bilder dorthin
kopiert. **Zeichnungen** liegen als verstecktes `.Notizname.md.excalidraw` neben der
Notiz, im Standardformat von Excalidraw, speichern sich ebenfalls automatisch und wandern
beim Umbenennen, Verschieben und Löschen mit. Die Schriften der Zeichenfläche werden mit
der App ausgeliefert (kein CDN). Die **Suche** findet Dateinamen und Notizinhalte in allen
Ordnern.

**Recently deleted** ist ein eigener Wiederherstellungsordner (`.trash` im Workspace),
nicht der macOS-Papierkorb. Dateien und Ordner bleiben dort erhalten und lassen sich
mit **Restore…** in einen gewählten Ordner zurückholen, bei Bedarf unter neuem Namen.
Änderungen im Finder werden beim erneuten Fokussieren der App oder über **Refresh files**
eingelesen. Symbolische Links werden nicht verfolgt.

Die Web-Vorschau zeigt die Oberfläche mit einem Desktop-Hinweis; sie schreibt keine
Dateien. GitLab-Synchronisierung ist noch nicht angebunden.

Die Dokumentansicht startet als große Canvas. **+** öffnet das Menü für neue Notizen,
Ordner und Importe; Suche und weitere Ansichten liegen hinter den kleinen Schaltflächen
in den Ecken. Karten lassen sich frei platzieren und auf Ordner ziehen. Ein geöffneter
Ordner blendet den übrigen Workspace ab. Positionen und Pins werden lokal in der App
gehalten; die Dateien selbst bleiben im Dokumentordner. **Alt + Pfeiltasten** verschiebt
eine fokussierte Karte, **Enter** öffnet sie. Zoom, Verschieben der Ansicht, Pins,
Listen-/Rasteransicht und Wiederherstellung sind über die Canvas-Optionen erreichbar.

**Dateiwerkzeuge:** Eine Datei auswählen und **Tools** öffnen. Für Bilder (`.jpg`,
`.png`, `.webp`, `.heic`, `.heif`) gibt es JPG/PNG/WebP, eine kleinere JPG-Kopie,
ein einseitiges Abgabe-PDF und ein PDF aus mehreren Fotos desselben Ordners. PDFs
lassen sich kombinieren, auf Seiten reduzieren, neu sortieren, in zwei Teile aufteilen
oder einzelne Seiten als PNG exportieren. Markdown- und Textnotizen lassen sich als
Text-PDF exportieren; eingebettete Bilder und Zeichnungen werden dabei nur als
Textverweise dargestellt, und der PDF-Text ist nicht auswählbar. Eine kleinere PDF-Kopie
ist für Scans und Upload-Limits gedacht: Dabei werden Seiten als Bilder gespeichert,
sodass durchsuchbarer Text, Links und Barrierefreiheitsinformationen verloren gehen
können. Alle Aktionen laufen lokal, behalten das Original und legen eine neue Datei
im selben Ordner an. Es gelten derzeit 25 MB pro Eingabe- und Ausgabedatei.
