# PDFs und Aufschriebe im Notizeditor

Ein PDF in Documents doppelklicken. In der ILIAS-Dateiansicht „Im Notizeditor
öffnen“ wählen, im Kurs „Aufschreiben“. Die Datei muss bereits heruntergeladen
sein. Bilder lassen sich über denselben Button in ihrer Vorschau übernehmen.
Markdown und Text öffnen weiterhin im bisherigen Editor.

## Bedienung

- PDF-Aufschriebe beginnen direkt mit den Seiten unter der Werkzeugleiste.
  Der Dateiname steht kompakt oben; Cover und großer Notiztitel erscheinen bei normalen Notizen.
- Die feste Leiste oben bietet Auswählen, Stift, Marker, Text, Radierer und fünf Farben.
  Werkzeug und Farbe gelten für alle Seiten. Rückgängig und Wiederholen stehen dort ebenfalls bereit.
  Ausgewählte Markierungen lassen sich verschieben und löschen. Ein Doppelklick
  auf einen ausgewählten Text öffnet ihn erneut.
- „Text“ wählen und auf das Blatt klicken: direkt an dieser Stelle schreiben.
  Die Eingabe hat keinen weißen Hintergrund oder sichtbaren Rahmen. Escape verwirft eine Texteingabe,
  Cmd/Ctrl + Enter oder ein Klick außerhalb übernimmt sie.
- „Notizseite hier einfügen“ im Zwischenraum setzt ein Blatt genau dort ein. „Notizseite“
  in der festen Leiste fügt nach dem aktuell verwendeten Blatt ein. Der Cursor landet
  direkt auf der neuen Seite; sie lässt sich sofort beschreiben.
- „Notizseiten“ ergänzt 1–10 Blätter nach jeder Originalseite. Bestehende
  Aufschriebe bleiben erhalten. Die gesamte Einfügung lässt sich rückgängig machen.
- Mit „Auswählen“ auf Notizseiten normal schreiben. Die bisherigen Blöcke,
  Bilder, Tabellen und Formeln lassen sich dort verwenden; das Blockmenü öffnet
  innerhalb der Notizseite. Stift, Marker und Text funktionieren ebenfalls direkt auf dem Blatt.
- „PDF exportieren“ speichert Originalseiten und Aufschriebe gemeinsam im
  selben Ordner. Der Export überschreibt keine vorhandene Datei.

## Speicherung

Der bestehende `StudyEditor` und dessen Autosave, Konfliktbehandlung und Undo
bleiben zuständig. Eine neue Aufschrieb-Datei heißt `Dateiname.pdf (Aufschriebe).md`.
Ihre Originalkopie liegt im benachbarten `attachments`-Ordner. Die Markdown-Datei
enthält `pdfPage`-Blöcke mit einem relativen Link, Seitenmaßen und Markierungen
sowie `studyPage`-Blöcke mit normalem Markdown und optionalen Markierungen.

Erneutes Öffnen des Originals öffnet die zugehörigen Aufschriebe. Eine spätere
ILIAS-Aktualisierung verändert weder die gespeicherte Originalkopie noch die
Aufschriebe. Beim Verschieben der Markdown-Datei kopiert die vorhandene
Attachment-Verwaltung die verlinkten PDF-Kopien mit.

## Recherche und Umsetzung

[PDF.js](https://mozilla.github.io/pdf.js/examples/) rendert Originalseiten im
Editor. Worker, Fonts, CMaps und WASM stammen aus den bereits gebündelten
Offline-Assets. Die Canvas-Auflösung ist begrenzt und nur nahe Seiten werden
gerendert.

[pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfdocument) kopiert beim Export
die Originalseiten einschließlich Format, Beschnitt und Drehung. Dadurch bleiben
Text und Vektoren der Quelle erhalten. Handschrift wird als transparente Ebene
ergänzt. Rich-Text-Aufschriebe werden mit den gebündelten Schriften, Formeln und
Bildern über [html-to-image](https://github.com/bubkoo/html-to-image) gerendert.
Notizseiten sind im exportierten PDF Bildseiten; editierbar bleiben sie in der
Markdown-Datei.

## Grenzen

- Import: PDF mit 1–500 Seiten, Bilder PNG/JPEG/GIF/WebP/BMP/AVIF; vorhandene
  Datei- und Uploadgrenze 25 MB. Die Markdown-Aufschriebe unterliegen weiterhin
  der bestehenden 2-MB-Grenze.
- Höchstens 1500 Original- und Notizseiten zusammen.
- Bestehender PDF-Text wird nicht umgeschrieben. Es werden Markierungen und
  Aufschriebe ergänzt. Geschützte oder beschädigte PDFs behalten die Vorschau
  und die Möglichkeit, sie in einer anderen App zu öffnen.
- Word und PowerPoint zuerst als PDF exportieren. Eine verlustfreie Bearbeitung
  ihrer nativen Dateiformate ist nicht Bestandteil dieser Integration.
- Die Aufschriebe werden lokal gespeichert und nicht nach ILIAS hochgeladen.

Die Prüfungen decken Markdown-Roundtrips einschließlich Unicode und Handschrift,
Batch-Einfügung/Undo, Wiederöffnung nach ILIAS-Updates, Konflikte, PDF-Reihenfolge,
Drehung/Beschnitt, Texteingabe/Stiftstriche und Attachment-Verschiebung ab.
