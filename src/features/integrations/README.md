# Integrations — prototype

Read models for data that comes from a university system, and the ILIAS mappers
that produce them. Nothing here is wired into the app yet.

**Do not build a feature on this without reading
[`docs/integrations/ilias-integration-research.md`](../../../docs/integrations/ilias-integration-research.md).**
The research behind it found that the richest ILIAS interface is closed at our
own university, which changes what a connector should even attempt.

## What is here

| File                     | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `lib/types.ts`           | Provider-agnostic read models. ILIAS never reaches the UI. |
| `lib/ilias/endpoints.ts` | URL building, including the path that moved in ILIAS 10.   |
| `lib/ilias/errors.ts`    | Provider answers to failures the UI can act on.            |
| `lib/ilias/envelope.ts`  | SOAP request building and response unwrapping.             |
| `lib/ilias/xml.ts`       | Shared reading helpers, `DOMParser`-based, no dependency.  |
| `lib/ilias/parse*.ts`    | Pure mappers: ILIAS XML or RSS in, read models out.        |
| `lib/ilias/fixtures/`    | Recorded and derived payloads the tests run against.       |

## What is deliberately missing

No connector, no store, no UI. A connector has to decide how it authenticates,
and that decision is waiting on answers from the university — see the open
questions in the research report. The mapping layer is the part that does not
change once those answers arrive, so it is the part that exists.

## Fixtures

`course.xml`, `courses-for-user*.xml` and `tree-childs.xml` were captured from
`demo.ilias.de` (ILIAS 10.11) on 2026-09-20 and hold nothing but that
installation's public demonstration content.

`exercise.xml` and `privfeed.rss` are **derived from the ILIAS source**, not
captured: both endpoints need an account, and an anonymous caller reaches
neither. Each file says so in its own header, along with the writer class it
follows. Replace them with real recordings when an account is available — the
tests should not have to change.

Never commit a fixture holding a real person's name, login or course
enrolment.

## Running the mappers against a live installation

```bash
node scripts/ilias-probe.js https://ilias.hs-heilbronn.de
```

See [`scripts/README.md`](../../../scripts/README.md).
