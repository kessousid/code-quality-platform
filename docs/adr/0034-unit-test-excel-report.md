# ADR-0034: Auto-generated Excel report for unit test runs

## Status

Accepted

## Context

Unit test runs already produce a JSON/HTML/PDF report, but only when
someone manually clicks "Generate" on the run's detail page. A per-test
Excel breakdown (Test Name, Status, Reason for Fail/No run) is more
useful pasted into a spreadsheet or shared with someone who doesn't use
this platform — and shouldn't need a manual click every time.

## Decision

**A fourth report format, `xlsx`**, added everywhere `UnitTestReportFormat`
already flows — no special-casing beyond the format list itself. Built
with `exceljs` (mirrors `pdfkit`'s "pure JS, no native binary or headless
browser" precedent already set by the PDF generator).

**Workbook shape**: `Summary` sheet (Run ID, Target, Status, Total/
Passed/Failed, Generated At) + `Test Results` sheet (Test File, Test
Name, Status, Duration, Reason — one row per `TestCaseResult`). Status
labels: `passed → 'Pass'`, `failed → 'Fail'`, `skipped → 'No run'`;
Reason is `failureMessage` for failed rows, blank otherwise.

**A real architectural constraint shaped the auto-generation trigger.**
Report files are stored via `ObjectStorage` (`LocalFilesystemObjectStorage`)
on whichever machine _generates_ them. Generation has only ever been
triggered from `apps/api` (hosted centrally on Railway), so generation
and serving have always happened on the same machine. Unit test _runs_,
however, execute on a developer's own worker (their laptop, per
docs/adr/0031) — if the worker generated the Excel file itself, it would
land on the developer's own disk, invisible to the Railway-hosted API
that serves downloads.

**Resolved: auto-generation triggers from the web page, not the worker.**
`UnitTestReportActions` already polls `useUnitTestReports`/observes the
run's status; a `useEffect` fires the exact same `POST
/unit-tests/:runId/reports` request the manual "Generate" button already
makes, the first time it sees the run reach `completed` with no `xlsx`
report yet present — so generation and storage stay exactly where they
already correctly happen. **Stated limitation**: this only fires if
someone has that run's page open at some point after it finishes; a run
nobody ever revisits won't get an unprompted report. Accepted given the
alternative — the worker calling back to the API over the internet —
would need giving a background service on a developer's laptop a real
API credential, a disproportionate new security surface for this ask.

## Consequences

- First new dependency added to `packages/reporting` since `pdfkit`.
- `exceljs`'s own bundled `.d.ts` predates `@types/node`'s generic
  `Buffer<T>` — a real reload-from-bytes round trip in
  `unit-test-excel-generator.spec.ts` needs an `as any` bridge at the
  `workbook.xlsx.load(...)` call site; harmless, just two different
  ambient `Buffer` type identities colliding, not a real type hole.
- A loaded (reread) worksheet has no memory of the original in-memory
  column _keys_ — XLSX itself doesn't store them — so any code reading a
  workbook back after a real save/load round trip must address cells
  positionally, not by the same string keys used to write them.
