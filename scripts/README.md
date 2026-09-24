# Scripts

Standalone Node scripts. They are not part of the app bundle and have no
dependencies beyond Node itself — run them with `node`, no build step.

## `ilias-probe.js`

Asks a public ILIAS installation what it exposes, without signing in.

```bash
node scripts/ilias-probe.js https://ilias.hs-heilbronn.de
node scripts/ilias-probe.js https://demo.ilias.de --json
```

An ILIAS integration depends on three facts that differ per university and
appear in no documentation: which release the site runs, whether its SOAP
endpoint is reachable from a student's machine, and which sign-in method it
uses. This answers all three in a few seconds, and prints a Markdown table
ready to paste into the research report.

Every request is a plain `GET`, except one anonymous `getInstallationInfoXML`
SOAP call that ILIAS answers for everybody. No credential is sent.

**Reading the output:** `403` means the path exists and a web server rule
refuses it. ILIAS's own hardening guide tells administrators to restrict the
SOAP endpoint that way, so at a careful university it is the expected answer,
not a fault to route around.

## `ilias-soap-poc.js`

Walks the read path a student integration would need and reports what each
call answered:

```
login -> getUserIdBySid -> getCoursesForUser -> getCourseXML
      -> getTreeChilds -> getFileXML -> getExerciseXML -> logout
```

It also exercises the failure cases on purpose, because how ILIAS refuses
matters as much as how it succeeds. Every call it makes is a read; nothing is
written back.

```bash
ILIAS_BASE_URL=https://demo.ilias.de \
ILIAS_CLIENT_ID=demo \
ILIAS_USERNAME=... ILIAS_PASSWORD=... \
node scripts/ilias-soap-poc.js
```

Without `ILIAS_USERNAME` and `ILIAS_PASSWORD` it still runs the anonymous and
failure-path checks and says which steps it skipped.

Add `--record <dir>` to write each response to disk for use as a test fixture.
**Recorded files contain live course and account data — scrub them before
committing anything.**

Credentials are read from the environment only. Never put them in a file in
this repository, and never paste real output containing a session id into an
issue: the script masks session ids in its own output for that reason.
