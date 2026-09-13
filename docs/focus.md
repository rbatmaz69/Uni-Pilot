# Focus

Über die Sidebar oder „Start focus“ im Dashboard erreichbar. Beide Einstiege verwenden denselben Timer.

- Standard: 25 Minuten Pomodoro und 5 Minuten Pause. Beide Zeiten lassen sich über das Regler-Icon auf 1–240 ganze Minuten einstellen.
- Die drei Bedienelemente unter dem Timer sind Zurücksetzen, Start/Pause und Zeiteinstellungen. Die Gruppe hat keinen äußeren Rand; nur der mittlere Button ist gefüllt. „Reset“ verwirft einen laufenden Arbeitsdurchlauf.
- Nach einer vollständig abgelaufenen Arbeitsphase wird die Session gespeichert und die Pause startet automatisch. Nach der Pause steht der nächste Arbeitsdurchlauf bereit.
- Der gesamte Focus-Bereich liegt auf einem Cover: Timer und Einstellungen. Die App-Kopfzeile bleibt wie auf der Kalenderseite sichtbar; eine zusätzliche Seitenüberschrift und Inhalte unter dem Cover entfallen. Bei kleinen Fenstern scrollt der Inhalt innerhalb des Covers.
- Das Statistik-Icon auf dem Cover öffnet Fortschritt, Wochenübersicht und Session-Verlauf als schließbares Panel über dem Cover. Der Timer läuft dabei weiter. Escape schließt zunächst die Statistikansicht.
- Statistik, Hintergrund, Ton und Cover-Größe stehen vertikal rechts unten; die Cover-Größe ist der unterste Button. „Cover toolbar“ zieht das Cover auch vor dem Start über Kopfzeile und Sidebar. „Show toolbar“ oder Escape stellt sie wieder her. Pausieren stellt sie automatisch wieder her, ebenso Beenden und Ablauf.
- Während der Timer läuft, verblassen Bedienelemente und Pomodoro-/Break-Zeiten gleichmäßig über etwa fünf Sekunden. Maus-, Touch-, Tastatur- oder Scroll-Interaktion blendet sie wieder ein und startet die Ausblendung neu. Offene Panels unterbrechen die Ausblendung. Ein kurzer Hinweis unten zeigt „Space“ als Pausen-Shortcut.
- Über das Bilder-Icon können beliebig viele eigene JPEG-, PNG-, WebP-, AVIF- oder GIF-Bilder (bis 50 MB je Datei) lokal hinzugefügt, ausgewählt und entfernt werden. Ohne Auswahl zeigt das Cover nur einen schlichten Farbverlauf. Bilder werden in IndexedDB gespeichert, die gewählte Bild-ID zusammen mit dem Timer lokal; es werden keine Bildvorlagen ausgeliefert.
- Bei Ablauf wird die Session ohne Hinweis gespeichert, auch wenn gerade eine andere Seite geöffnet ist. Vorzeitig beendete Sessions werden ebenfalls ohne Hinweis gespeichert. Ein abschaltbarer Dreiklang ertönt bei regulärem Ablauf, sofern die Browser-/WebView-Audiowiedergabe verfügbar ist.
- Sessions, aktiver Timer und Tonpräferenz werden lokal auf diesem Gerät gespeichert (`uni-pilot.focus`). Es gibt keinen Cloud-Sync.

Der Timer verwendet eine absolute Endzeit. Seitenwechsel, verzögerte Browser-Ticks und Neuladen setzen ihn nicht zurück. Bei vollständig geschlossener oder vom Betriebssystem angehaltener App wird kein Signal ausgegeben; ein abgelaufener Timer wird beim nächsten Öffnen bzw. Aufwachen abgeschlossen. Nach Neuladen kann der Browser den Ton bis zur nächsten Nutzerinteraktion blockieren.

Der Fortschrittsring wird während eines laufenden Timers in jedem Animationsframe direkt aus der absoluten Endzeit berechnet. Dadurch läuft er unabhängig von der sekündlich angezeigten Restzeit kontinuierlich; bei Pause bleibt er stehen und nach Rückkehr zum Tab gleicht er sich an die tatsächliche Restzeit an.

Statistiken berücksichtigen gespeicherte Fokuszeit, einschließlich vorzeitig beendeter Sessions, aber ohne Pausenzeiten oder verworfene Durchläufe. Zeitabschnitte werden an lokalen Mitternachtsgrenzen aufgeteilt. Die Woche beginnt am Montag. Session-Anzahl und Streak zählen nur vollständig abgelaufene Timer; ein Streak darf zuletzt gestern fortgeführt worden sein. Die Historie zeigt die letzten vier Sessions, die Statistiken verwenden alle gespeicherten Sessions.

Kurs-/Kalenderzuordnungen sind nicht Bestandteil dieser ersten Umsetzung.

Prüfung: `npm run check` und `npm run build`. Die Focus-Tests decken Zustandsübergänge, automatische Pausen, Hintergrundbetrieb, Wiederherstellung, Eingabevalidierung und Statistikgrenzen ab. Für manuelle Prüfung im Browser bzw. Tauri: einen einminütigen Pomodoro auslaufen lassen, den automatischen Break-Start und Ton testen sowie den Focus Mode in heller/dunkler Darstellung und bei schmalem Fenster prüfen.
