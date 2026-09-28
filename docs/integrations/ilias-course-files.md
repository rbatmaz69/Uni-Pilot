# ILIAS course files in Documents

A course's ILIAS files live in the student's Documents workspace, next to their own notes, instead
of in a second file browser. The Courses page says what is going on in a course; the document
explorer is the one place files are browsed, opened, annotated and searched.

This is the "opt-in per course" that [`ilias-sync-research.md`](ilias-sync-research.md) §7 rule 1
asks for: downloading a file records a read event in ILIAS, so nothing is downloaded until the
student switches a course on or clicks a file, and the switch says so.

## Where the files go

```
Documents/Uni Pilot/
  Courses/
    Winter 2026-27/
      Datenbanken 1/                ← the student's: notes, drawings, their own files
        Zusammenfassung.md
        ILIAS/                      ← Uni Pilot's: mirrors the course's ILIAS folders
          .ilias-sync.json          ← hidden manifest
          Vorlesungsfolien/
            Kapitel 1.pdf
          Übungsblätter/
            Blatt 1.pdf
```

- The semester comes from the course title (`- WS25`, `SoSe 2023`, `2024 WS` …) or, failing that,
  from the course's period (`src/features/courses/lib/semester.ts`). Without either, the course goes
  straight into `Courses/`.
- The course folder is named after the title without its module number and semester. A folder the
  student already made with that name is shared with the course; one holding another course's
  files is not (`Datenbanken 1 2`).
- Files are named after their ILIAS title plus suffix. Names are made safe for every file system
  and never overwrite anything (`Folien 2.pdf`).
- The course folder may be moved or renamed; the sync finds its `ILIAS` folder again by the
  manifest.

## What a sync does

One direction only: ILIAS → this computer.

| On ILIAS                 | On this computer                | What happens                                                         |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| New file                 | —                               | Downloaded.                                                          |
| New file over 100 MB     | —                               | Listed, not downloaded. One click on Download in Courses fetches it. |
| Newer version            | Untouched since it arrived      | Replaced; the old one goes to Recently deleted as `… (version N)`.   |
| Newer version            | Changed by the student          | Both kept: the new one arrives as `… (version N)` beside it.         |
| Unchanged                | Anything                        | Nothing.                                                             |
| No longer listed         | Present                         | Kept, marked "No longer on ILIAS".                                   |
| Listed                   | Deleted or moved by the student | Noted, not brought back.                                             |
| In a folder switched off | Anything                        | Not read, not touched.                                               |

"Changed" is decided by size and modification time against what the manifest recorded when the file
arrived. A file the student adds inside `ILIAS/` is theirs and never touched.

Reads and downloads wait behind the sync's pause (two to three seconds between requests,
`fetch::Pace`), so ILIAS sees one polite visitor. A first sync of a large course takes minutes; the
Courses page shows how far it is. Later syncs read the folders and fetch only what changed.

A course with "Sync automatically" on is synced when the course list has just been read (Courses
page, or the keep-alive in `CourseSync`) and the last sync is over three hours old. A click on
Download in Courses saves that one file into the same folder, sync or no sync.

## What the explorer does with it

- The `ILIAS` folder carries the ILIAS badge; files from ILIAS a small one, and a file ILIAS no
  longer lists says so.
- The `ILIAS` folder cannot be renamed, moved or deleted, and a folder holding one cannot be
  deleted: the sync finds its files by it. "Stop syncing" in Courses removes the manifest, and the
  folder becomes an ordinary one. Its files stay.
- A banner inside the folder names the course and links back to it.

The badge is `src/features/integrations/components/IliasBadge.tsx`, a placeholder drawn with the
same icon as the ILIAS menu item. To use the official ILIAS logo, replace that one component — and
check ILIAS e.V.'s terms for using the logo first.

## Where the code is

| Part                                   | File                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| Manifest, names, the per-file decision | `src-tauri/src/ilias_sync/mirror/manifest.rs`                       |
| Reading a course, downloading, placing | `src-tauri/src/ilias_sync/mirror/mod.rs`                            |
| Badges and protection in the explorer  | `src-tauri/src/documents.rs` (`mark_synced`, `Move`, `Trash`)       |
| Commands from the page                 | `src/features/integrations/lib/iliasSync.ts`                        |
| Which courses sync, progress, reports  | `src/features/courses/store/courseFilesStore.ts`                    |
| The Courses UI                         | `src/features/courses/components/CourseFiles.tsx`, `CourseView.tsx` |

The Rust tests in `mirror/` cover every row of the table above against a real temporary workspace;
the network half is the same `fetch` the rest of the sync uses.
