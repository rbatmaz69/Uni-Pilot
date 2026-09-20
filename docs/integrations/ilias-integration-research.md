# ILIAS-Integration — Recherche und Proof of Concept

> **Status:** Recherche abgeschlossen, PoC teilweise durchgeführt.
> **Stand:** 20.09.2026 · **Issue:** [#14](https://github.com/rbatmaz69/Uni-Pilot/issues/14)
> **Code:** [`src/features/integrations/`](../../src/features/integrations/) (Prototyp), [`scripts/`](../../scripts/)

---

## 1. Executive Summary

**Kann Uni Pilot ILIAS über offizielle Schnittstellen integrieren? Ja — aber nicht über den
Weg, der am meisten liefern würde, und an unserer eigenen Hochschule heute noch gar nicht.**

Die Recherche hat vier Dinge ergeben, die die Planung verändern:

1. **SOAP ist die einzige reichhaltige Schnittstelle** — 100 Funktionen, darunter alles, was für
   Kurse, Materialien, Dateien und Aufgaben gebraucht wird. Studierende dürfen damit ihre _eigenen_
   Daten lesen; dafür ist kein Admin-Account nötig. ✅ verifiziert
2. **An `ilias.hs-heilbronn.de` ist SOAP von außen gesperrt.** Der Endpunkt antwortet mit
   `403 Request forbidden by administrative rules`. Das ist kein Fehler, sondern genau die
   Härtung, die ILIAS in seiner eigenen Sicherheitsdokumentation empfiehlt. ✅ verifiziert
3. **Eine IP-Allowlist und eine Desktop-App schließen einander aus.** Uni Pilot läuft auf den
   Rechnern der Studierenden, also auf beliebigen, wechselnden IP-Adressen. Selbst wenn die
   Hochschule freischalten wollte — die Freischaltung, die sie kennt, passt nicht zu unserem
   Deployment-Modell. Das ist der zentrale Blocker, und er ist architektonisch, nicht organisatorisch.
4. **Zwei offizielle Kanäle funktionieren an der HHN heute schon und brauchen kein Passwort:**
   das persönliche **iCal-Abo** (`/calendar.php?client_id=…&token=…`) und der **private
   Nachrichten-Feed** (`/privfeed.php`). Beide werden mit einem Token bzw. einem separaten
   Feed-Passwort autorisiert, das Studierende selbst in ILIAS erzeugen. ✅ verifiziert

**Empfehlung für den MVP:** Kalender und Ankündigungen über die Token-Kanäle. Das ist keine
Notlösung — es ist der einzige Weg, der ohne Zutun der Hochschule funktioniert, ohne
Hochschul-Passwörter auskommt und über beliebig viele Hochschulen hinweg trägt. Für Kurse,
Materialien und Aufgaben muss die SOAP-Freischaltung mit dem Rechenzentrum geklärt werden,
**bevor** dafür Entwicklungszeit eingeplant wird.

**Was ausdrücklich nicht geht:** Ein allgemeines REST-API gibt es im ILIAS-Core nicht. LTI ist
für diesen Zweck die falsche Richtung. Aufgaben-Abgaben sind über keine offizielle Schnittstelle
möglich.

---

## 2. Methode und Vertrauensgrade

Jede Aussage in diesem Bericht trägt eine Kennzeichnung:

| Kennzeichen         | Bedeutung                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| ✅ **verifiziert**  | In dieser Story live geprüft — gegen `demo.ilias.de`, `ilias.hs-heilbronn.de` oder den ILIAS-Quelltext. |
| 📘 **dokumentiert** | Aus offizieller ILIAS-Doku oder dem Quelltext abgeleitet, aber nicht ausgeführt.                        |
| 🟡 **Community**    | Aus nicht-offiziellen Quellen. Keine Zusage.                                                            |
| 🔴 **offen**        | Nicht ermittelbar ohne Zugang oder Auskunft der Hochschule.                                             |

Der Quelltext von ILIAS gilt hier als offizielle Quelle: Er ist die Implementierung, gegen die
integriert wird, und ist in mehreren Punkten genauer als die Handbücher — insbesondere bei den
Berechtigungen einzelner SOAP-Funktionen, die nirgends sonst dokumentiert sind.

Reproduzierbar gemacht wurden die Messungen über [`scripts/ilias-probe.js`](../../scripts/ilias-probe.js)
und [`scripts/ilias-soap-poc.js`](../../scripts/ilias-soap-poc.js).

---

## 3. Bestehende Uni-Pilot-Architektur

Untersucht wurde Branch `#14`, nicht `main` — dort liegt der aktuelle Stand.

### 3.1 Was es gibt

| Ebene         | Realität                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| Frontend      | React 19 + TypeScript + Vite + Tailwind v4                                   |
| Desktop-Hülle | Tauri 2 (Rust), `tauri-plugin-http` aktiv                                    |
| State         | Zustand-Stores mit `persist` → `localStorage`                                |
| Backend       | **Keines.**                                                                  |
| Datenbank     | **Keine.**                                                                   |
| Auth          | **Keine.** Es gibt keinen Uni-Pilot-Account.                                 |
| Tests         | Vitest + Testing Library, `environment: 'jsdom'`, Tests neben der Quelldatei |

**Das ist die wichtigste Randbedingung des ganzen Berichts.** Das Konzeptbild aus dem Issue
(`Frontend → Uni Pilot API → Integration Layer → Connector`) beschreibt eine Server-Architektur,
die es nicht gibt. Es gibt keinen Server, der ILIAS anspricht — **die Desktop-App ist der
Integrations-Client.**

Und das ist ein Vorteil, kein Mangel:

- Zugangsdaten und Tokens verlassen das Gerät der Studierenden nie.
- Es gibt keinen zentralen Dienst, der Hochschulzugänge hält und damit zum lohnenden Angriffsziel
  wird.
- Es gibt keinen Auftragsverarbeitungsvertrag zu verhandeln, weil Uni Pilot keine
  Studierendendaten verarbeitet — der Rechner der Studierenden tut es.
- Ein Nutzer kann die Daten eines anderen technisch gar nicht sehen; es gibt keine geteilte
  Datenhaltung, in der eine Mandantentrennung schiefgehen könnte.

Der Preis: keine serverseitige Hintergrundsynchronisation, kein Webhook-Empfänger, und jeder
Client spricht einzeln mit der Hochschule.

### 3.2 Was bereits existiert und wiederverwendet werden muss

Der Branch bringt genau die Infrastruktur mit, die eine ILIAS-Anbindung braucht — **es sind weder
neue npm- noch neue Cargo-Abhängigkeiten nötig.**

| Datei                                        | Was sie schon löst                                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/icsFetch.ts`                        | CORS: Im Desktop läuft der Request über `@tauri-apps/plugin-http` in Rust, im Browser über `fetch` mit Dev-Proxy-Fallback. Genau das Muster, das ein ILIAS-Transport braucht.                                          |
| `src/lib/ics.ts`                             | Vollständiger iCal-Parser inklusive Wiederholungsregeln, mit 324 Zeilen Tests. **Der ILIAS-Kalender braucht keinen eigenen Parser.**                                                                                   |
| `src/features/calendar/store/sourceStore.ts` | Abonnieren, Aktualisieren, Stale-Erkennung (6 h), Fehler pro Quelle, Rebuild beim Start, Events bleiben bei Netzfehlern stehen. **Das ist bereits die Synchronisationsstrategie**, die dieser Bericht empfehlen würde. |
| `src/features/calendar/lib/icsMapping.ts`    | Mappt Feed-Events auf `CalendarEvent`, erkennt deutsche Kursbezeichnungen. Der Quelltext nennt Heilbronner Stundenpläne bereits als Referenz.                                                                          |
| `src-tauri/capabilities/default.json`        | `http:default` für `https://*` und `http://*` — die App darf bereits beliebige HTTP-Requests absetzen. Siehe Abschnitt 11.3, das ist zu eng zu fassen.                                                                 |

**Konsequenz:** Der Kalenderteil einer ILIAS-Integration ist überwiegend Konfiguration, nicht
Implementierung. Ein ILIAS-iCal-Link ist eine Kalenderquelle wie jede andere.

### 3.3 Konventionen, an die sich die Integration halten muss

Aus `CLAUDE.md` auf Branch `#14`:

- Fachliche Features unter `src/features/<name>/{components,store,lib}/`, nicht unter `src/components/`.
- Querverweise über den `@/`-Alias, nicht über relative `../`-Pfade.
- Neues Verhalten bringt seinen Test mit, direkt neben der Quelldatei.
- Keine hartkodierten Farben, Radien oder Schatten — alles semantische Tokens.
- `src/lib/navigation.ts` ist die einzige Quelle für Routen; ein neuer Eintrag braucht eine neue Route.

---

## 4. Offizielle ILIAS-Schnittstellen

### 4.1 SOAP — die einzige vollwertige Datenschnittstelle

**Endpunkt** (versionsabhängig, ✅ verifiziert):

| ILIAS | Pfad                          | Beleg                                         |
| ----- | ----------------------------- | --------------------------------------------- |
| bis 9 | `/webservice/soap/server.php` | `ilias.hs-heilbronn.de` (9.23) antwortet dort |
| ab 10 | `/soap/server.php`            | `demo.ilias.de` (10.11) antwortet dort        |

Grund: ILIAS 10 hat das Webroot nach `public/` verschoben. Die Migration
`ilSoapWsdlPathUpdateStep` schreibt den gespeicherten WSDL-Pfad beim Update von `/webservice/`
auf `/public/` um. Eine Integration, die den Pfad fest verdrahtet, bricht beim nächsten
Hochschul-Update.

Die WSDL ist ohne Anmeldung abrufbar (`?wsdl`). `demo.ilias.de` und `test9.ilias.de` liefern
beide **102 identische Operationen** — der SOAP-Funktionsumfang ist zwischen ILIAS 9 und 10
stabil, nur der Pfad ändert sich. ✅ verifiziert

**Aktivierung:** Jeder authentifizierte Aufruf läuft durch `ilSoapAdministration::checkSession()`.
Dort gilt `$soap_check = true` für alle Administrations-Klassen, und die Prüfung endet mit
`(int) $set->get('soap_user_administration', '0') === 1`. Die Einstellung heißt im Interface
„Administration via SOAP" und steht per Default auf **aus**. 📘 dokumentiert (Quelltext)

Zusätzlich prüft ILIAS 11 `legalDocuments->canUseSoapApi()` — wer die Nutzungsbedingungen nicht
akzeptiert hat, kann SOAP nicht verwenden. 📘

#### Funktionsumfang (100 Funktionen, ✅ verifiziert gegen `inc.soap_functions.php`, release_11)

| Bereich            | Funktionen                                                                                                                                                                                                                                                                                                                                                                            | Für Uni Pilot |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Session            | `login`, `logout`, `getUserIdBySid`, `lookupUser`                                                                                                                                                                                                                                                                                                                                     | **Kern**      |
| Kurse              | `getCoursesForUser`, `getCourseXML`, `addCourse`, `updateCourse`, `deleteCourse`, `assignCourseMember`, `excludeCourseMember`, `isAssignedToCourse`                                                                                                                                                                                                                                   | **Kern**      |
| Gruppen            | `getGroupsForUser`, `getGroup`, `groupExists`, `addGroup`, `updateGroup`, `assignGroupMember`, `excludeGroupMember`, `isAssignedToGroup`                                                                                                                                                                                                                                              | relevant      |
| Repository         | `getTreeChilds`, `getXMLTree`, `getObjectByReference`, `getObjectsByTitle`, `searchObjects`, `getPathForRefId`, `getRefIdsByObjId`, `getObjIdsByRefIds`, `getObjIdByImportId`, `getRefIdsByImportId`, `addObject`, `addReference`, `updateObjects`, `deleteObject`, `moveObject`, `copyObject`, `ilClone`, `ilCloneDependencies`, `removeFromSystemByImportId`, `getStructureObjects` | **Kern**      |
| Dateien            | `getFileXML`, `addFile`, `updateFile`                                                                                                                                                                                                                                                                                                                                                 | **Kern**      |
| Übungen            | `getExerciseXML`, `addExercise`, `updateExercise`                                                                                                                                                                                                                                                                                                                                     | **Kern**      |
| Tests              | `getTestResults`, `getTestUserData`, `getQuestionSolution`, `saveQuestion`, `saveQuestionSolution`, `getNrOfQuestionsInPass`, `getPositionOfQuestion`, `getPreviousReachedPoints`, `removeTestResults`                                                                                                                                                                                | später        |
| Lernfortschritt    | `getProgressInfo`, `getLearningProgressChanges`, `deleteProgress`                                                                                                                                                                                                                                                                                                                     | später        |
| SCORM              | `getIMSManifestXML`, `getSCORMCompletionStatus`, `hasSCORMCertificate`                                                                                                                                                                                                                                                                                                                | nein          |
| Nutzer             | `getUserXML`, `searchUser`, `importUsers`, `getUsersForContainer`, `getUsersForRole`, `hasNewMail`, `deleteExpiredDualOptInUserObjects`                                                                                                                                                                                                                                               | begrenzt      |
| Rechte (RBAC)      | `getOperations`, `getLocalRoles`, `getUserRoles`, `getRoles`, `searchRoles`, `getObjectTreeOperations`, `grantPermissions`, `revokePermissions`, `addRole`, `deleteRole`, `addRoleFromTemplate`, `addUserRoleEntry`, `deleteUserRoleEntry`                                                                                                                                            | nein          |
| Weblinks           | `readWebLink`, `createWebLink`, `updateWebLink`                                                                                                                                                                                                                                                                                                                                       | gering        |
| Medien             | `saveTempFileAsMediaObject`, `getMobsOfObject`                                                                                                                                                                                                                                                                                                                                        | nein          |
| Organisationseinh. | 10 `…OrgUnit…`-Funktionen                                                                                                                                                                                                                                                                                                                                                             | nein          |
| Installation       | `getInstallationInfoXML`, `getClientInfoXML`, `buildHTTPPath`                                                                                                                                                                                                                                                                                                                         | **Kern**      |
| Sonstiges          | `exportDataCollectionContent`, `startBackgroundTaskWorker`                                                                                                                                                                                                                                                                                                                            | nein          |

#### Was im SOAP-Funktionsumfang fehlt — und leicht übersehen wird

Die Liste ist lang genug, um vollständig zu wirken. Sie ist es nicht:

- ❌ **Keine News-/Ankündigungsfunktion.** Kein `getNews`, nichts Vergleichbares. ✅ verifiziert
- ❌ **Keine Kalenderfunktion.** Kein Zugriff auf Termine über SOAP. ✅ verifiziert
- ❌ **Keine Abgabe von Übungsaufgaben.** `getExerciseXML` liest, `addExercise`/`updateExercise`
  legen eine Übung an bzw. ändern sie — eine Einreichung hochzuladen ist nicht vorgesehen. ✅ verifiziert
- ❌ **Kein Forum, keine Notizen, keine Benachrichtigungen.** ✅ verifiziert

Für Ankündigungen und Kalender gibt es andere offizielle Wege (4.5, 4.6). Für Abgaben gibt es keinen.

#### Berechtigungen: Studierende dürfen ihre eigenen Daten lesen

Der wichtigste Einzelbefund der SOAP-Analyse. In `ilSoapCourseAdministration::getCoursesForUser`:

```php
//#18004
// Enable to see own participations by reducing the needed permissions
$permission = $user_id === $ilUser->getId() ? 'read' : 'write';
```

Für die eigene `user_id` genügt `read` statt `write`. Ein normaler Studierenden-Account kann also
seine eigenen Kurse abrufen — es braucht keinen Service- oder Admin-Account. Dasselbe Muster:

| Funktion            | Benötigte Berechtigung                                                |
| ------------------- | --------------------------------------------------------------------- |
| `getCoursesForUser` | `read` für eigene Kurse, `write` für fremde                           |
| `getCourseXML`      | `read` auf den Kurs                                                   |
| `getFileXML`        | `read` auf die Datei                                                  |
| `getExerciseXML`    | `read`; mit `write` kommen zusätzlich die Teilnehmerdaten mit         |
| `getUserXML`        | eigenes Profil frei, fremde nur mit `read_users` auf den Nutzerordner |

✅ verifiziert (Quelltext release_11)

Das ist die Grundlage dafür, dass eine Integration ohne institutionellen Service-Account denkbar
ist — sofern SOAP überhaupt erreichbar ist.

#### SOAP-Plugins

ILIAS kennt einen Plugin-Slot `ilSoapHook`, über den ein Plugin eigene SOAP-Methoden registrieren
kann (`components/ILIAS/WebServices/SOAP/classes/class.ilSoapHookPlugin.php`). 📘 Damit ließen sich
fehlende Funktionen nachrüsten — siehe Abschnitt 4.3.

### 4.2 REST — im Core nicht vorhanden

**Der ILIAS-Core hat kein allgemeines REST-API.** ✅ verifiziert

Es gibt zwar eine Komponente `components/ILIAS/WebServices/Rest` mit einem `server.php`, aber
`ilRestServer::init()` registriert genau zwei Routen:

```php
$this->get('/fileStorage', array($callback_obj,'getFile'));
$this->post('/fileStorage', array($callback_obj,'createFile'));
```

Das ist interne Dateiablage für asynchrone Operationen, keine Schnittstelle für Fremdsysteme.

**Das Community-Plugin** `hrz-unimr/Ilias.RESTPlugin` (Uni Marburg) bietet ein echtes REST-API mit
OAuth2 und API-Keys. 🟡 Aber:

- Letzter Commit: **27.02.2018**. ✅ verifiziert (GitHub-API)
- Der Fork `srsolutionsag/Ilias.RESTPlugin` ist **archiviert**, letzter Push 12/2020. ✅
- An `ilias.hs-heilbronn.de` ist es **nicht installiert** (`/restplugin.php` und `/api.php` → 404). ✅

Ein seit acht Jahren unpflegtes Plugin, das die Hochschule erst installieren müsste, ist keine
Grundlage für eine Produktintegration.

### 4.3 Plugins — machbar, aber nicht für uns

ILIAS hat eine ausgereifte Plugin-Infrastruktur, und ein Plugin könnte über `ilSoapHook` genau die
Funktionen bereitstellen, die fehlen (News, Kalender, Abgaben). 📘

**Warum das trotzdem nicht der Weg ist:**

- Jede Hochschule müsste es selbst installieren und bei jedem ILIAS-Update mitziehen.
- Plugins sind versionsgebunden; ILIAS 9 → 10 hat die gesamte Verzeichnisstruktur umbenannt.
- Es löst den eigentlichen Blocker nicht: Ein Plugin hinter einer IP-Allowlist bleibt unerreichbar.
- Der Aufwand skaliert mit der Zahl der Hochschulen, das Ziel ist aber Hochschulunabhängigkeit.

**Bewertung:** Als strategische Lösung ungeeignet. Als hochschulspezifischer Sonderweg denkbar,
wenn eine einzelne Hochschule aktiv kooperieren will — aber erst, wenn der Rest steht.

### 4.4 LTI — die falsche Richtung

ILIAS bringt beides mit: `LTIProvider` und `LTIConsumer`. ✅ verifiziert (Komponentenliste)

Hier wird regelmäßig zweierlei verwechselt:

| Was LTI kann                                                                       | Was Uni Pilot braucht                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Uni Pilot als _Tool_ in ILIAS einbetten — ILIAS startet uns, Nutzer landen bei uns | ILIAS als _Datenquelle_ auslesen              |
| ILIAS gibt einzelne Objekte an eine externe Plattform frei (`LTIProvider`)         | Alle Kurse, Materialien, Termine einer Person |
| Kontext eines _einzelnen Launches_: Kurs-ID, Rolle, Nutzer                         | Vollständige, wiederholbare Synchronisation   |

LTI liefert Daten immer nur im Moment eines Launches und immer nur für das eine Objekt, über das
gestartet wurde. Es gibt keinen Weg, per LTI „alle Kurse dieser Person" abzufragen. LTI Advantage
(AGS/NRPS) kehrt die Richtung sogar um: Dort stellt die _Plattform_ dem _Tool_ Noten und
Teilnehmerlisten bereit — Uni Pilot wäre das Tool und bekäme nur, was der jeweilige Kurs freigibt.

**Bewertung:** Als primärer Integrationsmechanismus ungeeignet. Später interessant, wenn Uni Pilot
umgekehrt _in_ ILIAS eingebunden werden soll — das ist ein anderes Produkt-Thema.

### 4.5 iCal-Kalenderabo — offiziell, tokenbasiert, erreichbar ✅

ILIAS erzeugt pro Nutzer einen Abo-Link:

```
<ilias>/calendar.php?client_id=<client>&token=<hash>
```

`ilCalendarSubscriptionGUI` erzeugt ihn, `ilCalendarRemoteAccessHandler` bedient ihn: Token prüfen,
Kalender einsammeln, als `text/calendar` ausliefern, Session sofort wieder beenden. 📘 (Quelltext)

**Entscheidend:** Der Token ersetzt das Passwort. Studierende erzeugen ihn selbst in ILIAS und
fügen die URL in Uni Pilot ein. Uni Pilot hält nie ein Hochschulpasswort.

Auswahlmodi: `SELECTION_PD` (alle eigenen Kalender), `SELECTION_CALENDAR` (ein einzelner),
`SELECTION_CATEGORY`. 📘

✅ **An `ilias.hs-heilbronn.de` erreichbar** — `calendar.php?client_id=iliashhn&token=…` antwortet
mit HTTP 200 (leer bei ungültigem Token). Mit falschem Client kommt „Client does not exist.",
womit nebenbei der Client-Name `iliashhn` bestätigt ist.

### 4.6 Privater RSS-Feed — offiziell, erreichbar, für Ankündigungen ✅

```
<ilias>/privfeed.php?client_id=<client>&user_id=<id>&hash=<hash>
```

`privfeed.php` verlangt HTTP-Basic-Auth und prüft gegen `ilObjUser::_getFeedPass($user_id)` —
ein **separates Feed-Passwort**, das Studierende in ihrem ILIAS-Profil setzen, **nicht** das
Login-Passwort. Voraussetzung ist die Einstellung `enable_private_feed`. 📘 (Quelltext, in
release_9 und release_11 identisch)

Das ist der offizielle Weg zu Ankündigungen, den SOAP nicht anbietet.

✅ **An `ilias.hs-heilbronn.de` erreichbar** — antwortet mit
`401 WWW-Authenticate: Basic realm="ILIAS Newsfeed"`. Der Endpunkt ist also nicht gesperrt;
ob `enable_private_feed` aktiv ist, lässt sich ohne Account nicht feststellen. 🔴

Zusätzlich gibt es `feed.php` für öffentliche Objekt-Feeds (an der HHN erreichbar, HTTP 200). ✅

### 4.7 WebDAV — vorhanden, ungeprüft

ILIAS bindet das Repository seit 5.4 über sabreDAV als WebDAV-Laufwerk an
(`components/ILIAS/WebDAV/README.md`). 📘 Das wäre ein Weg zu Kursdateien.

- `ilias.hs-heilbronn.de/webdav.php` → HTTP 500 ohne Parameter, `/webdav.php/hhn/` → HTTP 200. ✅
  Der Endpunkt ist erreichbar, aber **ob er mit Zugangsdaten nutzbar ist, wurde nicht geprüft.** 🔴
- `demo.ilias.de/webdav.php` → **403**, dort also gesperrt. ✅

Offen ist außerdem, ob WebDAV bei OIDC-Anmeldung überhaupt funktioniert — WebDAV kennt nur
HTTP-Basic, und ein OIDC-Konto hat kein Basic-taugliches Passwort. 🔴 **Das ist der lohnendste
nächste Messpunkt**, weil es Dateizugriff ohne SOAP bedeuten würde.

### 4.8 Import/Export

ILIAS kann Kurse und Lernmodule als XML/ZIP exportieren (`components/ILIAS/Export`). 📘 Das ist ein
manueller Vorgang in der Oberfläche und pro Objekt — als Synchronisationsweg ungeeignet, als
einmaliger Migrationspfad denkbar. Nicht weiter verfolgt.

---

## 5. Versionsunterschiede

| Thema                 | ILIAS 8                  | ILIAS 9                  | ILIAS 10            | ILIAS 11                         |
| --------------------- | ------------------------ | ------------------------ | ------------------- | -------------------------------- |
| Verzeichnislayout     | `Services/` + `Modules/` | `Services/` + `Modules/` | `components/ILIAS/` | `components/ILIAS/`              |
| SOAP-Pfad             | `/webservice/soap/…`     | `/webservice/soap/…`     | `/soap/…`           | `/soap/…`                        |
| SOAP-Funktionsumfang  | 📘 vergleichbar          | ✅ 102 Operationen       | ✅ 102 Operationen  | 100 (Skill-Zertifikate entfernt) |
| CAS-Authentifizierung | ✅ `Services/CAS`        | ❌ entfernt              | ❌                  | ❌                               |
| Radius                | ✅ `Services/Radius`     | ❌ entfernt              | ❌                  | ❌                               |
| SOAP-Auth-Komponente  | `Services/SOAPAuth`      | 📘                       | 📘                  | `components/ILIAS/AuthSOAP`      |
| iCal-Abo              | ✅                       | ✅                       | ✅                  | ✅                               |
| Privater RSS-Feed     | ✅                       | ✅                       | ✅                  | ✅                               |
| Core-REST             | ❌                       | ❌                       | ❌                  | ❌                               |

**Was daraus für den Connector folgt:**

- Stabil über alle Versionen: iCal-Abo, privater Feed, der SOAP-Funktionsumfang selbst.
- Versionsabhängig: der SOAP-Pfad. Genau ein Unterschied, und er ist erkennbar — deshalb probiert
  [`soapEndpointCandidates()`](../../src/features/integrations/lib/ilias/endpoints.ts) beide Pfade,
  neuen zuerst.
- Nicht mehr verwenden: CAS und Radius existieren seit ILIAS 9 nicht mehr.
- ILIAS 11 hat die drei Skill-Zertifikats-Funktionen entfernt — Beleg dafür, dass der
  SOAP-Funktionsumfang zwar stabil, aber nicht garantiert ist.

---

## 6. Authentifizierung

### 6.1 Die zentrale Frage

> **Kann Uni Pilot auf ILIAS-Daten zugreifen, ohne das Passwort der Studierenden zu speichern?**

**Ja — für Kalender und Ankündigungen. Nein — für SOAP.**

| Kanal             | Autorisierung                                    | Passwort nötig?                        | Widerrufbar?                    |
| ----------------- | ------------------------------------------------ | -------------------------------------- | ------------------------------- |
| iCal-Abo          | Token in der URL, in ILIAS erzeugt               | **Nein**                               | Ja, Token in ILIAS neu erzeugen |
| Privater RSS-Feed | HTTP-Basic mit separatem Feed-Passwort           | **Nein** (nicht das Hochschulpasswort) | Ja, Feed-Passwort ändern        |
| SOAP              | `login(client, username, password)` → Session-ID | **Ja, bei jedem Sitzungsaufbau**       | Nur durch Passwortwechsel       |
| WebDAV            | HTTP-Basic                                       | 🔴 offen, vermutlich ja                | Nur durch Passwortwechsel       |

Das ist ein starkes Argument dafür, die Token-Kanäle zuerst zu bauen: Sie sind nicht nur die
erreichbaren, sie sind auch die datenschutzfreundlicheren.

### 6.2 Was SOAP-Login tatsächlich akzeptiert

`ilSoapUserAdministration::login()` baut `ilAuthFrontendCredentials` mit Benutzername und Passwort
und lässt `ilAuthProviderFactory` die passenden Provider ermitteln. ✅ verifiziert (Quelltext)

**Daraus folgt unmittelbar:** SOAP-Login funktioniert nur mit Verfahren, die auf Benutzername und
Passwort beruhen:

| Verfahren            | SOAP-Login möglich? | Begründung                                                     |
| -------------------- | ------------------- | -------------------------------------------------------------- |
| Lokal (ILIAS-intern) | ✅ ja               | Klassischer Credential-Provider                                |
| LDAP                 | ✅ ja 📘            | Credential-Provider; Hochschulpasswort wird durchgereicht      |
| SOAPAuth             | ✅ ja 📘            | Credential-Provider gegen einen externen SOAP-Dienst           |
| Apache/Header        | 📘 unklar           | Setzt Webserver-Kontext voraus, den ein API-Aufruf nicht hat   |
| **Shibboleth/SAML**  | ❌ **nein**         | Browser-Redirect-Flow; es gibt kein Passwort zum Weiterreichen |
| **OpenID Connect**   | ❌ **nein**         | Ebenso — Redirect zum Identity Provider                        |
| CAS                  | — entfällt          | Seit ILIAS 9 nicht mehr enthalten ✅                           |

**Für die HHN heißt das:** Die Login-Seite verweist auf `/openidconnect.php`, die Hochschule nutzt
also OIDC-SSO. ✅ verifiziert. Selbst wenn SOAP erreichbar wäre, hätten Studierende
voraussichtlich gar kein ILIAS-Passwort, das `login()` akzeptieren würde. 🔴 zu bestätigen — es ist
möglich, dass parallel lokale Passwörter existieren.

**Damit steht SOAP an der HHN vor zwei unabhängigen Blockern:** der Netzwerksperre _und_ dem
Authentifizierungsverfahren. Beide müssen fallen, damit der Weg funktioniert.

### 6.3 Drei Dinge, die gern verwechselt werden

1. **Einen Nutzer in Uni Pilot anmelden.** Gibt es nicht und braucht es nicht — es existiert kein
   Uni-Pilot-Konto.
2. **Einen Nutzer in ILIAS anmelden.** Macht die Hochschule, per OIDC im Browser.
3. **Autorisierten Zugriff auf ILIAS-Daten für ein externes Programm bekommen.** Das ist die
   eigentliche Frage — und (1) und (2) beantworten sie nicht.

Ein erfolgreicher SSO-Login im Browser erzeugt **keinen** API-Zugang. ILIAS kennt keinen
OAuth-Autorisierungsserver, über den ein Fremdprogramm delegierten Zugriff erhalten könnte.

### 6.4 Tokens und delegierter Zugriff

Was ILIAS im Core **nicht** hat: 📘

- Keine OAuth2-/OIDC-Provider-Rolle für Drittanwendungen.
- Keine persönlichen API-Tokens.
- Keinen Mechanismus für delegierten Zugriff.

Was es **hat** — und das ist mehr, als es zunächst scheint:

- **Kalender-Token** (4.5) — funktional ein Bearer-Token mit Leserecht auf die eigenen Termine.
- **Feed-Passwort** (4.6) — ein zweckgebundenes Zweitpasswort, das der Nutzer selbst kontrolliert.

Beide sind keine vollwertigen OAuth-Ersätze, aber sie erfüllen genau die Eigenschaften, auf die es
ankommt: vom Nutzer selbst erzeugt, auf Lesezugriff beschränkt, jederzeit widerrufbar, und das
Hochschulpasswort bleibt außen vor.

### 6.5 Session-Verhalten von SOAP — ein Fallstrick

✅ **Live gemessen an `demo.ilias.de`:** Ein `getCoursesForUser` mit einer **frei erfundenen
Session-ID** liefert **HTTP 200 mit einem leeren Ergebnis** — keinen SOAP-Fault.

```
OK  getCoursesForUser mit nie vergebener Session-ID
    → NICHT abgelehnt — HTTP 200, 0 Zeilen.
```

`getTreeChilds` liefert mit derselben ungültigen Session sogar **echte Repository-Daten**: ILIAS
beantwortet den Aufruf als anonymer Nutzer, statt die Session zurückzuweisen.

**Konsequenz für den Connector — und sie ist nicht offensichtlich:** Eine abgelaufene Session ist
von „du hast keine Kurse" nicht zu unterscheiden, wenn nur auf SOAP-Faults geprüft wird. Nach
einem Session-Ablauf sähen Studierende eine leere, fehlerfreie Kursliste. Die Session muss
deshalb **separat verifiziert** werden, bevor einer leeren Antwort geglaubt wird.

Zum Vergleich, ebenfalls gemessen: ein falsches Passwort wird sauber abgelehnt
(`faultstring: err_wrong_login`), und `getUserIdBySid` läuft bei ungültiger Session in einen
PHP-Fehler (`Trying to access array offset on value of type null`, HTTP 500) statt in eine saubere
Auth-Meldung. Die Fehlerbehandlung von ILIAS ist in diesem Bereich uneinheitlich — genau dafür
existiert [`errors.ts`](../../src/features/integrations/lib/ilias/errors.ts).

---

## 7. Feature-Matrix

**Legende Status:** ✅ Verfügbar · ⚠️ Teilweise/eingeschränkt · 🏫 Braucht Hochschulkonfiguration ·
🔴 Unbekannt · ❌ Nicht verfügbar
**Legende Doku:** ✅ offiziell dokumentiert bzw. im Core-Quelltext belegt · 🟡 Community · — entfällt
**Auth:** `Pwd` = Benutzername + Passwort · `Token` = nutzererzeugter Token · `Feed-Pwd` =
separates Feed-Passwort

| #   | Feature                        | Operation  | API/Service                             | Doku | Version | Berechtigung    | Auth     | Hochschul-Konfiguration                 | Komplexität       | PoC                      | Fallback                 | Status               |
| --- | ------------------------------ | ---------- | --------------------------------------- | ---- | ------- | --------------- | -------- | --------------------------------------- | ----------------- | ------------------------ | ------------------------ | -------------------- |
| 1   | Verbindung/Instanz-Info        | Read       | SOAP `getInstallationInfoXML`           | ✅   | alle    | keine           | keine    | SOAP erreichbar                         | niedrig           | ✅ getestet              | —                        | ✅                   |
| 2   | Anmeldung                      | Read       | SOAP `login`/`logout`                   | ✅   | alle    | —               | Pwd      | `soap_user_administration` + Netzzugang | mittel            | ⚠️ nur Fehlerfall        | Browser-Login            | 🏫                   |
| 3   | Eigene Nutzer-ID               | Read       | SOAP `getUserIdBySid`                   | ✅   | alle    | Session         | Pwd      | wie 2                                   | niedrig           | ❌                       | —                        | 🏫                   |
| 4   | Eigenes Profil                 | Read       | SOAP `getUserXML`                       | ✅   | alle    | eigenes frei    | Pwd      | wie 2                                   | niedrig           | ❌                       | manuelle Eingabe         | 🏫                   |
| 5   | Fremdes Profil                 | Read       | SOAP `getUserXML`                       | ✅   | alle    | `read_users`    | Pwd      | Admin-Rolle                             | —                 | ❌                       | —                        | ❌ (unerwünscht)     |
| 6   | **Eigene Kurse**               | Read       | SOAP `getCoursesForUser`                | ✅   | alle    | `read` (eigene) | Pwd      | wie 2                                   | mittel            | ⚠️ Mapper getestet       | manuelle Kursliste       | 🏫                   |
| 7   | Kursdetails                    | Read       | SOAP `getCourseXML`                     | ✅   | alle    | `read`          | Pwd      | wie 2                                   | niedrig           | ✅ Mapper gegen Live-XML | WebView                  | 🏫                   |
| 8   | Kurs anlegen/ändern            | Write      | SOAP `addCourse`/`updateCourse`         | ✅   | alle    | `write`         | Pwd      | Admin                                   | —                 | ❌                       | —                        | ❌ (out of scope)    |
| 9   | Kursmitgliedschaft             | Write      | SOAP `assignCourseMember`               | ✅   | alle    | `write`         | Pwd      | Admin                                   | —                 | ❌                       | —                        | ❌ (out of scope)    |
| 10  | Gruppen                        | Read       | SOAP `getGroupsForUser`/`getGroup`      | ✅   | alle    | `read`          | Pwd      | wie 2                                   | mittel            | ❌                       | —                        | 🏫                   |
| 11  | **Ordner/Materialbaum**        | Read       | SOAP `getTreeChilds`                    | ✅   | alle    | `read`          | Pwd      | wie 2                                   | mittel            | ✅ Mapper gegen Live-XML | WebView                  | 🏫                   |
| 12  | Dateimetadaten                 | Read       | SOAP `getFileXML` (Modus 0)             | ✅   | alle    | `read`          | Pwd      | wie 2                                   | niedrig           | ⚠️ Mapper offen          | WebView                  | 🏫                   |
| 13  | **Dateiinhalt**                | Read       | SOAP `getFileXML` (Modus ≠0)            | ✅   | alle    | `read`          | Pwd      | wie 2                                   | hoch¹             | ❌                       | Download-Link im Browser | 🏫                   |
| 14  | Dateiinhalt                    | Read       | WebDAV                                  | ✅   | ≥5.4    | `read`          | Basic    | WebDAV aktiv                            | mittel            | ❌                       | —                        | 🔴                   |
| 15  | Datei hochladen                | Write      | SOAP `addFile`/`updateFile`             | ✅   | alle    | `write`         | Pwd      | wie 2                                   | hoch              | ❌                       | WebView                  | ❌ (out of scope)    |
| 16  | **Aufgaben/Deadlines**         | Read       | SOAP `getExerciseXML`                   | ✅   | alle    | `read`          | Pwd      | wie 2                                   | mittel²           | ✅ Mapper getestet       | WebView                  | 🏫                   |
| 17  | **Aufgabe abgeben**            | Write      | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | **WebView/Browser**      | ❌ **nicht möglich** |
| 18  | Abgabe ändern                  | Write      | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | WebView                  | ❌ nicht möglich     |
| 19  | Feedback/Bewertung             | Read       | SOAP `getExerciseXML` (nur mit `write`) | ✅   | alle    | `write`         | Pwd      | Dozentenrolle                           | —                 | ❌                       | WebView                  | ❌ für Studierende   |
| 20  | **Ankündigungen (kursweit)**   | Read       | RSS `feed.php`                          | ✅   | alle    | öffentlich      | keine    | Feed je Objekt aktiv                    | niedrig           | ⚠️ Endpunkt erreichbar   | WebView                  | ⚠️                   |
| 21  | **Ankündigungen (persönlich)** | Read       | RSS `privfeed.php`                      | ✅   | alle    | eigene          | Feed-Pwd | `enable_private_feed`                   | niedrig           | ✅ Mapper getestet       | WebView                  | ✅ **MVP**           |
| 22  | Gelesen-Status setzen          | Write      | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | WebView                  | ❌ nicht möglich     |
| 23  | **Kalender/Termine**           | Read       | iCal `calendar.php?token=`              | ✅   | alle    | eigene          | Token    | Kalender aktiv                          | **sehr niedrig**³ | ✅ Endpunkt verifiziert  | manueller ICS-Import     | ✅ **MVP**           |
| 24  | Termin anlegen                 | Write      | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | WebView                  | ❌ nicht möglich     |
| 25  | Tests: Metadaten               | Read       | SOAP `getTestUserData` u.a.             | ✅   | alle    | `read`          | Pwd      | wie 2                                   | hoch              | ❌                       | **WebView**              | 🏫                   |
| 26  | Test bearbeiten                | Write      | SOAP `saveQuestionSolution`             | ✅   | alle    | `read`          | Pwd      | wie 2                                   | **sehr hoch**     | ❌                       | **WebView**              | ❌ (bewusst nicht)   |
| 27  | Testergebnisse                 | Read       | SOAP `getTestResults`                   | ✅   | alle    | 🔴              | Pwd      | wie 2                                   | mittel            | ❌                       | WebView                  | 🏫                   |
| 28  | Lernfortschritt                | Read       | SOAP `getProgressInfo`                  | ✅   | alle    | 🔴              | Pwd      | wie 2                                   | mittel            | ❌                       | eigene Berechnung        | 🏫                   |
| 29  | Fortschrittsänderungen         | Read       | SOAP `getLearningProgressChanges`       | ✅   | alle    | 🔴              | Pwd      | wie 2                                   | mittel            | ❌                       | —                        | 🏫                   |
| 30  | Benachrichtigungen             | Read       | — (nur `hasNewMail`)                    | ✅   | alle    | eigene          | Pwd      | wie 2                                   | niedrig           | ❌                       | privfeed (21)            | ⚠️                   |
| 31  | Foren                          | Read/Write | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | **WebView**              | ❌ nicht möglich     |
| 32  | Notizen                        | Read/Write | —                                       | —    | —       | —               | —        | —                                       | —                 | —                        | WebView                  | ❌ nicht möglich     |

¹ Dateiinhalte kommen base64-codiert im SOAP-Envelope — für große Dateien ungeeignet.
² `getExerciseXML` liefert pro Assignment **keine ID und keinen Titel**, nur Instruction, DueDate
und Dateien. Identitäten müssen synthetisiert werden, siehe 8.3.
³ Weil `src/lib/ics.ts` und `sourceStore.ts` bereits existieren.

### Was die Matrix in einem Satz sagt

Von 32 untersuchten Operationen sind **zwei heute an der Zielhochschule nutzbar** (21, 23), **acht
weitere hingen nur an der SOAP-Freischaltung** (6, 7, 11, 12, 16 und Folge), und **sechs sind über
keine offizielle Schnittstelle möglich** — darunter mit der Aufgabenabgabe (17) ausgerechnet die
Funktion, die Studierende am häufigsten brauchen.

---

## 8. Zielinstanz: Hochschule Heilbronn

Alle Werte ohne Anmeldung ermittelt, reproduzierbar über
`node scripts/ilias-probe.js https://ilias.hs-heilbronn.de`.

### 8.1 Messergebnis (20.09.2026)

| Prüfung                            | Ergebnis                                                     | Bedeutung                        |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| ILIAS-Version                      | **9.23** (Assets `?version=9_23`, Layout `Services/`)        | SOAP-Pfad nach „bis 9"-Schema    |
| `client_id`                        | **`iliashhn`**                                               | Für Kalender-/Feed-URLs nötig    |
| Anmeldeverfahren                   | **OpenID Connect** (`/openidconnect.php` auf der Loginseite) | Siehe 6.2 — blockiert SOAP-Login |
| `/soap/server.php?wsdl`            | 404                                                          | Konsistent mit ILIAS 9           |
| `/webservice/soap/server.php?wsdl` | **403 „Request forbidden by administrative rules." (nginx)** | **Pfad existiert, gesperrt**     |
| `/calendar.php`                    | 200 mit `client_id=iliashhn`                                 | ✅ **erreichbar**                |
| `/privfeed.php`                    | **401 `Basic realm="ILIAS Newsfeed"`**                       | ✅ **erreichbar**                |
| `/feed.php`                        | 200                                                          | ✅ erreichbar                    |
| `/webdav.php/hhn/`                 | 200                                                          | erreichbar, ungeprüft 🔴         |
| `/restplugin.php`, `/api.php`      | 404                                                          | Kein REST-Plugin installiert     |

### 8.2 Bewertung

Die `403`-Antwort ist kein Konfigurationsfehler. ILIAS empfiehlt in
`docs/configuration/secure.md` ausdrücklich:

> „ILIAS provides a SOAP web service interface (`/soap/server.php`) […] you SHOULD restrict access
> to this endpoint on the web server level so that only trusted hosts can reach it."

Das Rechenzentrum der HHN hat also genau das Richtige getan.

**Und daraus folgt der unangenehme Teil.** Die Freischaltung, die ILIAS vorsieht, ist eine
**IP-Allowlist**. Uni Pilot ist eine Desktop-App auf den Rechnern von Studierenden — im WLAN, im
Zug, im Homeoffice, mit wechselnden Adressen. Es gibt keine IP-Liste, die das abdeckt.

Damit gibt es für SOAP an der HHN nur drei denkbare Auswege, und alle drei sind teuer:

1. **Zentraler Uni-Pilot-Server mit fester IP**, der für alle Studierenden mit ILIAS spricht. Das
   kehrt genau den Vorteil um, der in 3.1 beschrieben ist: Dieser Server müsste die
   Hochschulzugänge aller Nutzer halten. Aus Datenschutzsicht die schlechteste aller Optionen.
2. **Ausnahme für den Campus-IP-Bereich** — funktioniert nur im Hochschulnetz, also genau dann
   nicht, wenn Studierende die App am ehesten nutzen.
3. **Kein SOAP.** Token-Kanäle nutzen und für den Rest auf WebDAV (🔴 zu prüfen) oder den Browser
   ausweichen.

**Option 3 ist die Empfehlung**, bis das Rechenzentrum etwas anderes anbietet.

### 8.3 Was an der HHN ohne Rücksprache sofort geht

```
Kalender:       https://ilias.hs-heilbronn.de/calendar.php?client_id=iliashhn&token=<token>
Ankündigungen:  https://ilias.hs-heilbronn.de/privfeed.php?client_id=iliashhn&user_id=<id>&hash=<hash>
```

Studierende erzeugen Token bzw. Feed-Passwort selbst in ILIAS. Beim Kalender ist der Aufwand
minimal: Der Link ist eine Kalenderquelle wie jede andere und läuft durch das bestehende
`sourceStore`.

---

## 9. Empfohlene Architektur

### 9.1 Realität statt Idealbild

```text
┌──────────────────────────────────────────────────────────────┐
│  Uni Pilot Desktop (Tauri)          Rechner der Studierenden │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ UI:  CalendarPage · CoursesPage · DashboardPage        │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │  nur provider-agnostische Modelle │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │ src/features/integrations/                             │  │
│  │   lib/types.ts    ExternalCourse, ExternalItem, …      │  │
│  │   lib/ilias/      Mapper · Endpunkte · Fehler          │  │
│  │   (später) lib/hisinone/                               │  │
│  └───────────────────────┬────────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │ src/lib/icsFetch.ts → @tauri-apps/plugin-http (Rust)   │  │
│  └───────────────────────┬────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────┘
                           │  HTTPS, direkt, ohne Zwischenstation
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌─────────────────────┐   ┌─────────────────────┐
   │ ILIAS der Hochschule│   │ HISinOne (später)   │
   │ iCal · RSS · (SOAP) │   │                     │
   └─────────────────────┘   └─────────────────────┘
```

**Kein Uni-Pilot-Server.** Das ist die bewusste Entscheidung, nicht das Fehlen einer. Sie kostet
serverseitige Hintergrundsynchronisation und bringt dafür, dass keine einzige
Hochschul-Zugangsinformation unser Haus je erreicht.

### 9.2 Provider-Abstraktion

Implementiert in [`src/features/integrations/lib/types.ts`](../../src/features/integrations/lib/types.ts):

```ts
export interface ExternalOrigin {
  provider: ProviderId; // 'ilias', später 'hisinone'
  installation: string; // 'ilias.hs-heilbronn.de'
}

export interface ExternalCourse extends ExternalRecord {
  title: string;
  description: string | null;
  language: string | null;
  period: ExternalPeriod | null;
  url: string | null; // Deep Link für den WebView-Fallback
}
```

Drei Entwurfsentscheidungen, die sich aus der Recherche ergeben haben:

1. **`installation` gehört zur Identität.** Zwei Hochschulen vergeben beide fröhlich die `ref_id` 717. Eine ID ist nur zusammen mit der Installation eindeutig, die sie ausgestellt hat.
2. **`providerType` bleibt erhalten.** ILIAS unterscheidet Dutzende Objekttypen, die UI kennt eine
   Handvoll Formen. Was nicht gemappt ist, wird `other` und behält seinen ILIAS-Typ — ein weiterer
   Typ ist dann eine Änderung an einer Stelle.
3. **`permissions` kommen mit.** `getTreeChilds` liefert pro Objekt die Operationen des
   aufrufenden Accounts (`visible`, `read`, …). Die Liste weiß damit im Voraus, ob ein Download
   erlaubt ist, statt es beim Klick herauszufinden.

Die **Reference-ID ist die Identität, nicht die Object-ID.** Das ILIAS-Kursdokument enthält
`id="il_12895_crs_5584"` (Object-ID), aber jeder Folgeaufruf — `getTreeChilds`, `goto.php` —
braucht die `ref_id`. Die beiden zu verwechseln ist der schnellste Weg zu einem Connector, der
nichts öffnen kann. Deshalb bekommt `parseCourse()` die `ref_id` als Parameter übergeben.

### 9.3 Erweiterung auf HISinOne

`lib/hisinone/` mit eigenen Mappern auf **dieselben** Zieltypen; `ProviderId` wird erweitert. Die
UI ändert sich nicht. Ob `ExternalCourse` auch für HISinOne trägt, entscheidet sich erst mit dessen
Recherche — aber die Trennlinie liegt an der richtigen Stelle.

Bewusst **nicht** getan: `ExternalCourse` mit dem bestehenden `Course` aus
`src/features/dashboard/lib/types.ts` verschmolzen. `Course` ist ein UI-Modell mit `tone` und
`schedule`; `ExternalCourse` ist ein Lesemodell einer fremden Quelle. Die Abbildung dazwischen
gehört in das Feature, das beide anzeigt.

---

## 10. Synchronisationsstrategie

**ILIAS hat keine Webhooks.** 📘 Es gibt keinen Weg, sich über Änderungen benachrichtigen zu
lassen. Polling ist die einzige Möglichkeit.

Die gute Nachricht: `sourceStore.ts` macht das bereits richtig, und das Muster ist übertragbar.

| Aspekt                  | Empfehlung                                                                      | Vorbild                        |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Initialer Abruf         | Beim Verbinden, sichtbar mit Fortschritt                                        | `sourceStore.subscribe`        |
| Manuell                 | Immer anbieten. Studierende wissen besser als wir, wann sich etwas geändert hat | `sourceStore.refresh`          |
| Automatisch             | Beim Öffnen der Seite, wenn älter als die Stale-Schwelle                        | `sourceStore.refreshStale`     |
| Stale-Schwelle Kalender | 6 h                                                                             | bereits implementiert          |
| Stale-Schwelle News     | 30 min — Ankündigungen sind zeitkritischer                                      | neu                            |
| Stale-Schwelle Kurse    | 24 h — Kurslisten ändern sich pro Semester, nicht pro Tag                       | neu                            |
| Änderungserkennung      | `LastUpdate` aus `getTreeChilds`; bei Feeds die `guid`                          | `parseTree.ts`, `parseFeed.ts` |
| Rohdaten aufheben       | Antwort im Original speichern, Modelle daraus neu bauen                         | `sourceStore.rebuildSource`    |
| Fehlerverhalten         | **Alte Daten stehen lassen.** Ein Netzfehler darf keinen Stundenplan leeren     | bereits implementiert          |
| Fehleranzeige           | Pro Quelle, mit Zeitpunkt der letzten erfolgreichen Aktualisierung              | `CalendarSource.error`         |
| Rate Limiting           | Nie mehrere Quellen parallel; ILIAS-Instanzen sind Hochschulsysteme             | `syncingIds`                   |
| Retry                   | Kein automatischer Retry bei `endpoint-blocked`/`soap-disabled`                 | `needsUniversityAction()`      |
| Duplikate               | Schlüssel aus `origin.installation` + `externalId`                              | `types.ts`                     |

Der Punkt „Rohdaten aufheben" verdient Betonung: `sourceStore` speichert den Feed im Original und
baut die Events bei jedem Start neu. Dadurch erreicht eine Verbesserung am Mapper auch die bereits
abonnierten Quellen. Für ILIAS-XML gilt dasselbe.

**Was nicht dauerhaft gespeichert werden sollte:** Dateiinhalte (nur auf ausdrücklichen Wunsch),
Namen anderer Studierender, alles aus `getUserXML` außer dem eigenen Profil.

---

## 11. Sicherheit und Datenschutz

### 11.1 Zugangsdaten

| Regel                                                  | Warum                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Kein Hochschulpasswort in `zustand/persist`.**       | Das landet in `localStorage` — unverschlüsselt und im Klartext lesbar. |
| Token-Kanäle bevorzugen.                               | Sie brauchen gar kein Passwort (6.1).                                  |
| Falls SOAP je kommt: Passwort in den OS-Schlüsselbund. | Stronghold oder Keychain/Credential Manager, nie in den App-State.     |
| Session-IDs nicht persistieren.                        | Kurzlebig; bei Bedarf neu anmelden.                                    |
| Keine Secrets ins Log.                                 | `ilias-soap-poc.js` maskiert Session-IDs aus genau diesem Grund.       |

Die Token-URLs (Kalender, Feed) sind selbst Geheimnisse: Wer den Link hat, liest den Kalender.
Sie gehören behandelt wie ein Passwort — nicht anzeigen, nicht ins Log, nicht in Fehlerberichte.
🔴 Offen: Ob ILIAS-Kalender-Token ablaufen, geht aus `ilCalendarAuthenticationToken` nicht hervor;
eine Ablaufprüfung gibt es dort nur für den zwischengespeicherten ICS-Inhalt.

### 11.2 Nutzertrennung

Uni Pilot hat **kein** Cross-User-Risiko: keine geteilte Datenhaltung, kein Server, ein
Betriebssystem-Nutzerkonto pro Installation. Die Forderung „kein Nutzer darf die ILIAS-Inhalte
eines anderen sehen" ist durch die Architektur erfüllt, nicht durch Code, der korrekt sein muss.

**Das ändert sich sofort und vollständig**, wenn ein zentraler Server eingeführt wird (8.2,
Option 1). Dann wird Mandantentrennung zur wichtigsten Sicherheitsanforderung des Produkts.

### 11.3 SSRF und die zu weite HTTP-Berechtigung

`src-tauri/capabilities/default.json` erlaubt derzeit:

```json
{ "identifier": "http:default", "allow": [{ "url": "https://*" }, { "url": "http://*" }] }
```

Das ist für Kalenderabos nachvollziehbar — Feeds liegen auf beliebigen Hosts. Mit einer
konfigurierbaren ILIAS-Basis-URL wächst die Angriffsfläche aber: Eine präparierte URL könnte die
App dazu bringen, interne Adressen abzufragen.

**Empfehlung:**

- `http://*` streichen, sobald kein Feed es mehr braucht — Hochschul-ILIAS spricht HTTPS.
- Die eingegebene Basis-URL validieren: nur `https`, kein `localhost`, keine privaten IP-Bereiche,
  keine Ports außer 443.
- `normaliseBaseUrl()` ist dafür der richtige Ort; es ist bereits die einzige Stelle, an der
  Nutzereingaben zu URLs werden.

### 11.4 Datenminimierung

| Kategorie                           | Speichern?                                       |
| ----------------------------------- | ------------------------------------------------ |
| Eigene Kurse, Titel, Termine        | Ja — das ist der Zweck                           |
| Eigener Name, eigene Matrikelnummer | Nur was angezeigt wird                           |
| **Namen anderer Studierender**      | **Nein.** `setAttachUsers(false)` bei Kursen     |
| Teilnehmerlisten                    | Nein                                             |
| Noten anderer                       | Nein — technisch ohnehin nur mit Dozentenrechten |
| Dateiinhalte                        | Nur auf ausdrücklichen Wunsch                    |

`getExerciseXML` liefert mit `write`-Rechten automatisch die Teilnehmerdaten mit
(`setAttachMembers($write_permission_ok)`). Für Studierende greift das nicht, aber ein Connector
darf sich darauf nicht verlassen und muss diese Felder verwerfen.

### 11.5 Verbindung trennen

Eine „Verbindung entfernen"-Aktion muss löschen: Token/Feed-Passwort, alle abgeleiteten Daten,
den Cache der Rohantworten. `sourceStore.remove` macht das für Kalenderquellen bereits richtig.

Zusätzlich anzeigen: **wie** Studierende den Zugriff auf ILIAS-Seite widerrufen — Token neu
erzeugen bzw. Feed-Passwort ändern. Nur das macht den Widerruf vollständig.

### 11.6 Rechtliches

Hier werden **keine Compliance-Aussagen** getroffen. Festgehalten wird nur die technische Lage:

- Uni Pilot verarbeitet als Desktop-App keine Studierendendaten auf eigener Infrastruktur.
- Die Daten verlassen das Gerät nicht; es gibt keine Übermittlung an Dritte.
- Ein Auftragsverarbeitungsvertrag ist nach dieser Lesart nicht erforderlich — **das ist zu
  prüfen, nicht zu behaupten.** 🔴
- **Sobald ein zentraler Server dazukommt, ändert sich diese Einschätzung vollständig.**
- Ob das Auslesen per API den Nutzungsbedingungen der Hochschule entspricht, ist mit dem
  Rechenzentrum zu klären. 🔴

---

## 12. Fallback-Strategie

Gegenüber dem Issue **umsortiert**, weil die Messergebnisse eine andere Reihenfolge nahelegen:

```
1. Offizieller Token-Kanal (iCal, privater RSS-Feed)
   └─ kein Passwort, an der HHN heute erreichbar, hochschulunabhängig
         ↓  wenn die Daten so nicht verfügbar sind
2. Offizielle SOAP-API
   └─ reichhaltig, aber 🏫 Freischaltung + Netzzugang nötig
         ↓  wenn SOAP gesperrt bleibt
3. WebDAV für Dateien
   └─ 🔴 noch zu prüfen; lohnendster nächster Messpunkt
         ↓
4. Deep Link in den Browser (goto.php)
   └─ funktioniert immer, nutzt das bestehende SSO der Hochschule
         ↓
5. Manueller Import (ICS-Datei, Download)
   └─ bereits implementiert: sourceStore.importFile
         ↓
6. Hochschulspezifisches ILIAS-Plugin
   └─ nur bei aktiver Kooperation einer einzelnen Hochschule
```

**Der Sprung von 1 nach 4 ist kürzer, als er aussieht.** Ein Deep Link, der im Systembrowser
öffnet, wo die Studierenden ohnehin per SSO angemeldet sind, ist für Aufgabenabgabe, Foren und
Tests nicht nur ein Notbehelf — er ist die richtige Lösung. Jedes `ExternalRecord` trägt deshalb
ein `url`-Feld.

**Embedded WebView wird nicht empfohlen.** Ein eingebetteter WebView müsste die SSO-Session
selbst verwalten, was bedeutet, Hochschul-Anmeldedaten durch unser Fenster laufen zu lassen. Der
Systembrowser hat die Session bereits und ist die sicherere und ehrlichere Variante.

---

## 13. Scraping

**Nicht empfohlen. Nicht implementiert.** Bewertet, um die Entscheidung festzuhalten:

| Kriterium         | Bewertung                                                                             |
| ----------------- | ------------------------------------------------------------------------------------- |
| Stabilität        | Sehr schlecht. ILIAS 9 → 10 hat sämtliche Asset-Pfade umbenannt.                      |
| Authentifizierung | OIDC-Redirect-Flow nachbauen heißt, das Hochschulpasswort durch unsere App zu führen. |
| Wartung           | Pro Hochschule und pro Release neu.                                                   |
| Recht             | Nutzungsbedingungen der Hochschule; nicht ohne Rücksprache.                           |
| Last              | HTML-Seiten sind um Größenordnungen teurer als ein API-Aufruf.                        |
| Sicherheit        | Erfordert Passwortspeicherung — genau das, was 6.1 vermeidet.                         |

Der entscheidende Punkt ist nicht die Fragilität, sondern die Authentifizierung: Scraping bei
OIDC-SSO bedeutet zwingend Passwortspeicherung. Das ist der Grund, warum es ausscheidet.

---

## 14. Proof-of-Concept-Ergebnisse

### 14.1 Was tatsächlich ausgeführt wurde

Gegen `https://demo.ilias.de` (ILIAS 10.11, `client_id=demo`) am 20.09.2026:

```
OK    getInstallationInfoXML (ohne Session)     → 10.11 2026-09-03 an /soap/server.php
OK    login mit falschen Zugangsdaten           → faultstring: err_wrong_login
OK    getCoursesForUser mit ungültiger Session  → NICHT abgelehnt: HTTP 200, 0 Zeilen
OK    Aufruf gegen falschen Endpunkt            → HTTP 404
SKIP  login … logout                            → keine Zugangsdaten hinterlegt
```

Zusätzlich anonym abgerufen und als Fixtures gespeichert:

| Aufruf                | Ergebnis                                                 |
| --------------------- | -------------------------------------------------------- |
| WSDL `demo.ilias.de`  | 108 KB, **102 Operationen**                              |
| WSDL `test9.ilias.de` | **102 identische Operationen** → Funktionsumfang stabil  |
| `getTreeChilds(279)`  | 23 Objekte, echte ILIAS-XML → `fixtures/tree-childs.xml` |
| `getCourseXML(717)`   | Vollständiges Kursdokument → `fixtures/course.xml`       |

### 14.2 Was nicht ausgeführt wurde — und warum

**Der authentifizierte Durchgang steht aus.** Es wurden keine Zugangsdaten verwendet; die
credentialpflichtigen Schritte sind übersprungen, nicht simuliert.

Damit ist **nicht** bestätigt:

- Ob `soap_user_administration` auf `demo.ilias.de` aktiv ist. 🔴 Ein Indiz spricht dafür: Der
  Aufruf mit ungültiger Session lief bis in die Logik und kam **nicht** mit „SOAP is not enabled"
  zurück. Bestätigt ist es damit nicht.
- Ob `getCoursesForUser` für einen echten Account gefüllte Zeilen liefert.
- Wie `getFileXML` und `getExerciseXML` real antworten.

**So wird es nachgeholt** (ein öffentliches Demo-Konto von `demo.ilias.de` genügt):

```bash
ILIAS_BASE_URL=https://demo.ilias.de \
ILIAS_CLIENT_ID=demo \
ILIAS_USERNAME=<demo-konto> ILIAS_PASSWORD=<passwort> \
node scripts/ilias-soap-poc.js --record /tmp/ilias-fixtures
```

Das Skript protokolliert jeden Schritt einzeln. Fehlschläge gehören unverändert in diesen
Bericht — ein fehlgeschlagener Schritt ist ein Ergebnis.

### 14.3 Implementierter Code

| Artefakt                                 | Umfang                                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| `scripts/ilias-probe.js`                 | Hochschulunabhängige Instanzanalyse ohne Login                |
| `scripts/ilias-soap-poc.js`              | Vertikaler SOAP-Durchstich inkl. Fehlerfälle                  |
| `src/features/integrations/lib/types.ts` | Provider-agnostische Lesemodelle                              |
| `…/lib/ilias/connection.ts`              | **Die Verbindungsschicht**: Discovery, Session, Lesezugriffe  |
| `…/lib/ilias/transport.ts`               | HTTP-Transport, injizierbar — Tests brauchen kein Netz        |
| `…/lib/ilias/endpoints.ts`               | Versionsabhängige URL-Bildung                                 |
| `…/lib/ilias/errors.ts`                  | 11 typisierte Fehlerarten, handlungsleitend                   |
| `…/lib/ilias/envelope.ts`                | SOAP-Envelope bauen und auspacken                             |
| `…/lib/ilias/parse*.ts`                  | Vier reine Mapper: Kurse, Baum, Übungen, Feed                 |
| `…/lib/ilias/connection.live.test.ts`    | Opt-in-Test gegen eine echte Installation                     |
| **Tests**                                | **116 offline** (Teil von `npm run check`) **+ 6 Live-Tests** |

Die Mapper für Kurse und Materialbaum laufen gegen **echte, live abgerufene** ILIAS-Antworten.
Die Fixtures für Übungen und Feed sind aus den ILIAS-XML-Writern abgeleitet, weil beide Endpunkte
einen Account verlangen — jede dieser Dateien sagt das in ihrem eigenen Kopf.

### 14.4 Verbindungsschicht — was sie kann und was verifiziert ist

`connection.ts` ist der Einstiegspunkt: Adresse rein, Installation erkennen, lesen.

```ts
const installation = await discoverInstallation('https://ilias.hs-heilbronn.de', httpTransport);
// → { version: '9.23', clientId: 'iliashhn', layout: 'legacy', soap: 'blocked' }
```

Zwei Befunde aus der Recherche sind fest eingebaut, damit kein Aufrufer sie vergessen kann:

1. **Der Endpunkt wird ermittelt, nicht konfiguriert.** Beide bekannten Pfade werden probiert,
   der neuere zuerst. Ein `403` wird als `blocked` festgehalten und nicht mit `missing`
   überschrieben — der Unterschied entscheidet, ob die Hochschule etwas tun muss.
2. **Eine leere Antwort wird nie ungeprüft weitergereicht.** `fetchCourses` und `fetchContents`
   verifizieren bei leerem Ergebnis erst die Session, bevor sie `[]` zurückgeben (siehe 6.5).
   Ohne das sähen Studierende nach Session-Ablauf eine leere, fehlerfreie Kursliste.

Ist SOAP gesperrt, liefert die Discovery trotzdem Version und `client_id` — sie liest sie dann
aus der Login-Seite. Genau das brauchen die Token-Kanäle, und genau das ist der Fall an der HHN.

#### Live verifiziert (ohne Zugangsdaten, 20.09.2026)

```
$ ILIAS_LIVE_BASE_URL=https://ilias.hs-heilbronn.de npm run test:ilias
    version   9.23
    client    iliashhn
    layout    legacy
    soap      blocked
    ✓ can be identified without signing in

$ ILIAS_LIVE_BASE_URL=https://demo.ilias.de npm run test:ilias
    version   10.11 2026-09-03
    client    demo
    layout    public-root
    soap      available (https://demo.ilias.de/soap/server.php)
    ✓ can be identified without signing in
```

Die Verbindungsschicht erkennt also beide realen Installationen korrekt, inklusive des
Pfadunterschieds zwischen ILIAS 9 und 10 und der Netzsperre an der HHN — die HHN-Werte stammen
vollständig aus dem Login-Seiten-Fallback, weil SOAP dort nichts beantwortet.

> Der Live-Test hat dabei einen echten Fehler gefunden: Die erste Fassung folgte keinen Redirects,
> und `login.php` antwortet an der HHN mit `302`. Damit blieben Version und `client_id`
> unbekannt. Behoben durch ein `redirect`-Feld im Transport. Genau dafür existiert dieser Test.

> Ein zweiter Fehler kam beim Gegenlesen des ILIAS-Quelltextes heraus: `privfeed.php` prüft das
> Feed-Passwort, `ilUserFeedWriter` vergleicht danach zusätzlich einen **Feed-Hash** aus der URL.
> Das sind zwei verschiedene Geheimnisse. Die erste Fassung schickte das Passwort als Hash — die
> Basic-Authentifizierung wäre durchgegangen und der Feed dann **stillschweigend leer** geblieben.
> Der Connector unterscheidet jetzt einen nie gefüllten Feed (kein Kanaltitel) von einer ruhigen
> Woche und meldet den Fehlerfall, statt „keine Ankündigungen" zu behaupten.

#### Noch nicht verifiziert 🔴

| Kanal             | Was fehlt                                            | Variable zum Einschalten                                  |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| iCal-Abo          | Abruf mit echtem Token                               | `ILIAS_LIVE_CAL_TOKEN`                                    |
| Privater Feed     | Abruf mit echtem Hash und Feed-Passwort              | `ILIAS_LIVE_FEED_USERNAME`/`_USER_ID`/`_HASH`/`_PASSWORD` |
| SOAP-Lesepfad     | Login, Kursliste, Kursinhalte                        | `ILIAS_LIVE_USERNAME` + `ILIAS_LIVE_PASSWORD`             |
| Desktop-Transport | Ob `tauri-plugin-http` `redirect: 'manual'` beachtet | nur in einem gepackten Build prüfbar                      |

Die drei ersten Zeilen sind in Minuten zu schließen — die Werte erzeugt man sich in ILIAS selbst
(Kalender → Abonnieren, Profil → Nachrichten-Feed). Es wird dabei nichts geloggt, was ein
Geheimnis preisgibt.

**Es gibt bewusst keine UI.** Welche Kanäle eine Hochschule freigibt, entscheidet, was ein Feature
überhaupt anzeigen kann — die Verbindungsschicht ist der Teil, der sich dadurch nicht mehr ändert.

## 15. Risiken

| Risiko                    | Beschreibung                                                          | Auswirkung | Minderung                                                                |
| ------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| **SOAP-Netzsperre**       | Endpunkt per IP-Allowlist geschlossen; Desktop-App hat keine feste IP | **Hoch**   | MVP auf Token-Kanäle stützen; Gespräch mit dem Rechenzentrum             |
| **SSO ohne API-Zugang**   | OIDC liefert kein Passwort für `login()`                              | **Hoch**   | Token-Kanäle; klären, ob lokale Passwörter existieren                    |
| SOAP nicht aktiviert      | `soap_user_administration` per Default aus                            | Hoch       | Im Fragenkatalog enthalten; `soap-disabled` wird eigens erkannt          |
| Versionsunterschiede      | Pfadwechsel bei ILIAS 10                                              | Mittel     | `soapEndpointCandidates()` probiert beide, getestet                      |
| Stille Session-Abläufe    | Ungültige Session liefert 200 mit leerer Antwort (6.5)                | **Hoch**   | Session separat verifizieren; leere Antwort nie als „keine Daten" deuten |
| Instabile Aufgaben-IDs    | Assignments haben keine eigene ID (8.3)                               | Mittel     | Zusammengesetzte ID; nutzerbezogene Daten dürfen nicht daran hängen      |
| Abgabe nicht möglich      | Keine offizielle Schnittstelle                                        | Mittel     | Deep Link in den Browser; ehrlich kommunizieren                          |
| Skalierung Hochschulen    | Jede Instanz anders konfiguriert                                      | Hoch       | `ilias-probe.js` macht Bewertung zur Minutenaufgabe                      |
| Zentralserver-Versuchung  | „Ein Server löst das SOAP-Problem" — und schafft ein größeres         | **Hoch**   | Entscheidung in 3.1/8.2 dokumentiert; bewusst gegen die Architektur      |
| Wartung bei ILIAS-Updates | Funktionen können entfallen (Skill-Zertifikate in 11)                 | Mittel     | Mapper defensiv; Tests gegen aufgezeichnete Fixtures                     |
| Token-Leak                | Kalender-/Feed-URL ist selbst ein Geheimnis                           | Mittel     | Nie anzeigen/loggen; Widerruf im UI erklären                             |

---

## 16. Offene Fragen

### 16.1 An das Rechenzentrum der Hochschule Heilbronn

1. Der SOAP-Endpunkt `/webservice/soap/server.php` antwortet von außen mit `403`. **Ist das eine
   bewusste IP-Allowlist?**
2. Falls ja: Gibt es einen Weg, eine Desktop-Anwendung auf Studierendenrechnern zuzulassen — oder
   ist der Endpunkt grundsätzlich nur für Serversysteme vorgesehen?
3. Ist die Einstellung **„Administration via SOAP" (`soap_user_administration`)** aktiviert?
4. Ist **`enable_private_feed`** aktiviert, also der persönliche Nachrichten-Feed nutzbar?
5. Ist die **Kalender-Abo-Funktion** für Studierende freigeschaltet?
6. Ist **WebDAV** für Studierende nutzbar, und **funktioniert es bei OIDC-Anmeldung?**
7. Haben Studierende neben OIDC ein **lokales ILIAS-Passwort**, oder ausschließlich SSO?
8. Wäre die Hochschule bereit, Uni Pilot als **OIDC-Client** zu registrieren — und welche Daten
   ließen sich darüber beziehen?
9. Gibt es eine **Testinstanz** oder einen Testaccount für Integrationsentwicklung?
10. Welche **Nutzungsbedingungen** gelten für automatisierte Zugriffe? Gibt es Rate-Limits?
11. Ist ein Update auf **ILIAS 10 oder 11** geplant, und wann?
12. Wen sprechen wir an, wenn Uni Pilot weiterverfolgt wird — gibt es einen Prozess für
    studentische Projekte?

> Diese Liste ist bewusst hochschulunabhängig formuliert und kann für jede weitere Hochschule
> wiederverwendet werden. `node scripts/ilias-probe.js <url>` beantwortet 1, 4, 5 und 6 vorab
> teilweise selbst.

### 16.2 An das Uni-Pilot-Team

1. Bleibt es bei „kein zentraler Server"? Die Antwort bestimmt die Sicherheitsarchitektur des
   gesamten Produkts (11.2).
2. Ist ein MVP nur mit Kalender und Ankündigungen aus ILIAS wertvoll genug?
3. Wie viel Konfigurationsaufwand ist Studierenden zuzumuten (Token in ILIAS erzeugen und
   einfügen)?
4. Sollen Deep Links im Systembrowser öffnen? (Empfehlung: ja, siehe 12.)
5. Welche Hochschule kommt als zweite — und wird vorher `ilias-probe.js` darauf laufen gelassen?

### 16.3 An die ILIAS-Community

1. Ist ein REST-API für den Core geplant? Der Feature-Wiki-Eintrag „REST Service" wäre zu prüfen. 🔴
2. Gibt es einen empfohlenen Weg für Desktop-Anwendungen, mit ILIAS zu sprechen, ohne
   IP-Allowlist?
3. Ist die stille Anonym-Antwort bei ungültiger Session (6.5) beabsichtigt?

---

## 17. Empfohlene nächste Schritte

### Sofort (keine Abhängigkeiten)

1. **Fragenkatalog 16.1 an das HHN-Rechenzentrum senden.** Das ist der längste Weg und blockiert
   die Hälfte der Roadmap — je früher, desto besser.
2. **Authentifizierten PoC-Lauf gegen `demo.ilias.de` nachholen** (14.2). Kostet Minuten und
   klärt, ob SOAP überhaupt liefert, was der Quelltext verspricht.
3. **WebDAV an der HHN prüfen.** Der lohnendste offene Messpunkt: Dateizugriff ohne SOAP.

### MVP (unabhängig von der Hochschule umsetzbar)

4. **Story: ILIAS-Kalender verbinden.** Geführter Ablauf „Token in ILIAS erzeugen → Link
   einfügen", danach eine normale Kalenderquelle. Der Großteil existiert bereits.
5. **Story: ILIAS-Ankündigungen.** Privater Feed, Feed-Passwort im OS-Schlüsselbund,
   `parseNewsFeed()` steht.
6. **Story: Verbindungsverwaltung.** Eine ILIAS-Instanz konfigurieren (Basis-URL, `client_id`),
   `ilias-probe.js`-Logik in die App holen, Status und Trennen anbieten.
7. **Story: HTTP-Berechtigung einschränken** (11.3). Klein, sicherheitsrelevant, jederzeit machbar.

### Nach Antwort der Hochschule

8. **Story: SOAP-Connector** — nur wenn 16.1/1–3 positiv beantwortet sind. Transport, Session,
   Session-Verifikation (6.5), `getCoursesForUser`.
9. **Story: Materialbaum und Dateien** — `getTreeChilds`, `getFileXML`; Mapper existieren.
10. **Story: Aufgaben und Deadlines** — `getExerciseXML` in den Kalender; Mapper existiert.

### Bewusst dauerhaft Fallback

11. **Aufgabenabgabe, Foren, Tests** → Deep Link in den Systembrowser. Keine offizielle
    Schnittstelle, und bei Tests wäre ein Nachbau auch fachlich falsch.

### Später

12. HISinOne-Recherche als zweiter Provider gegen dieselben Modelle.
13. Lernfortschritt (`getProgressInfo`), sobald SOAP steht.

---

## 18. Quellen

### Offizielle ILIAS-Quellen

| Quelle                           | URL                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| ILIAS-Repository                 | https://github.com/ILIAS-eLearning/ILIAS                                           |
| SOAP-Funktionen (release_11)     | `components/ILIAS/soap/include/inc.soap_functions.php`                             |
| SOAP-Basisklasse, `checkSession` | `components/ILIAS/soap/classes/class.ilSoapAdministration.php`                     |
| Kurs-SOAP, Berechtigung `#18004` | `components/ILIAS/soap/classes/class.ilSoapCourseAdministration.php`               |
| Login-Implementierung            | `components/ILIAS/soap/classes/class.ilSoapUserAdministration.php`                 |
| Datei-SOAP                       | `components/ILIAS/soap/classes/class.ilSoapFileAdministration.php`                 |
| Übungs-SOAP                      | `components/ILIAS/soap/classes/class.ilSoapExerciseAdministration.php`             |
| Core-REST-Server                 | `components/ILIAS/WebServices/Rest/classes/class.ilRestServer.php`                 |
| SOAP-Pfad-Migration              | `components/ILIAS/WebServices/classes/Setup/ilSoapWsdlPathUpdateStep.php`          |
| Kalender-Abo                     | `components/ILIAS/Calendar/classes/class.ilCalendarSubscriptionGUI.php`            |
| Kalender-Remote-Zugriff          | `components/ILIAS/Calendar/classes/class.ilCalendarRemoteAccessHandler.php`        |
| Privater RSS-Feed                | `components/ILIAS/Feeds/resources/privfeed.php`                                    |
| RSS-Template                     | `Services/Feeds/templates/default/tpl.rss_2_0.xml` (release_9)                     |
| Übungs-XML-Writer                | `Modules/Exercise/classes/class.ilExerciseXMLWriter.php` (release_9)               |
| Datei-XML-Writer                 | `Modules/File/classes/class.ilFileXMLWriter.php` (release_9)                       |
| Kurs-XML-Writer                  | `Modules/Course/classes/class.ilCourseXMLWriter.php` (release_9)                   |
| **Sicherheitsdokumentation**     | `docs/configuration/secure.md` — Abschnitt „Restrict access to the SOAP interface" |
| WebDAV                           | `components/ILIAS/WebDAV/README.md`                                                |
| API-Übersicht (nur intern)       | `docs/development/api-overview.md`                                                 |
| SOAP-Administration (Handbuch)   | https://docu.ilias.de/go/lm/951                                                    |

### Live geprüfte Installationen

| Instanz                 | Version            | Erhoben am |
| ----------------------- | ------------------ | ---------- |
| `demo.ilias.de`         | 10.11 (2026-09-03) | 20.09.2026 |
| `test9.ilias.de`        | 9.x                | 20.09.2026 |
| `ilias.hs-heilbronn.de` | 9.23               | 20.09.2026 |

### Community-Quellen (keine Zusage)

| Quelle                      | URL                                               | Stand                           |
| --------------------------- | ------------------------------------------------- | ------------------------------- |
| ILIAS REST Plugin (Marburg) | https://github.com/hrz-unimr/Ilias.RESTPlugin     | Letzter Commit 27.02.2018       |
| Fork srsolutionsag          | https://github.com/srsolutionsag/Ilias.RESTPlugin | **Archiviert**, Push 16.12.2020 |
