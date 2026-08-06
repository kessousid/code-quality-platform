# ADR-0038: Consolidated "Unit tests" output tree

## Status

Accepted

## Context

Generated Jest tests have always been written one-off, next to each
source file (`<source>.generated.test.<ext>` — docs/adr/0024). Running
generation against a folder with many files scatters generated tests
throughout the target repo's own tree, with no single place to see what
this platform has produced, and no distinction between the two generator
types (`gemini` vs `script`, docs/adr/0026) beyond re-reading each file's
own content. The user asked for a single consolidated folder instead, and
for re-running against the same target to override its previous output
rather than accumulate stale files (e.g. left behind for a source file
since renamed or deleted).

## Decision

**Every generated test and its local execution report now live under one
tree, at the repo's own root:**

```
Unit tests/
  AI Based/       (generator: 'gemini')
    <mirrors the source's own relative path from repo root>
      <source>.generated.test.<ext>
      execution report/
        report.json
  Script based/    (generator: 'script')
    <same structure>
```

`testFilePathFor()` is unchanged in spirit — still a pure function of the
source's own relative path, still computed entirely by the orchestrator
and never trusted from the LLM's response (the load-bearing security
property from docs/adr/0024's `GeneratedTestCode` port comment) — it's
just nested under a new `Unit tests/<AI Based|Script based>/` base
determined solely by `run.generator`, itself never LLM-controlled either.

**Override, not accumulate.** Before generating, `runUnitTestGeneration`
deletes `Unit tests/<generator folder>/<target.path>` (recursively) if it
exists, then regenerates fresh. For a directory target this exactly
scopes to what's about to be regenerated — cleanly handling a source file
since renamed or deleted, which a blind per-file overwrite alone would
never clean up. For a single-file target this is a no-op in practice
(there's only ever one deterministic output path for a given source file,
already correctly overwritten by the plain `writeFile`), so no special
case was needed for that path.

**A local execution report, not the same thing as the web UI's
downloadable report.** `packages/reporting`'s PDF/Excel/HTML/JSON report
is generated and stored only by `apps/api` into object storage
(docs/adr/0034 — the only machine that can serve it back for download).
Generated tests, however, are written by whichever machine actually runs
the job — a developer's own worker (docs/adr/0031/0032). Rather than
build a new mechanism to copy the API-generated report back down to a
worker machine, `writeLocalExecutionReport()` writes a small,
purpose-built JSON summary (generator, target, timestamp, pass/fail
counts, per-test results) directly from the worker, right next to the
tests it just generated — for a developer working in the repo/IDE with no
need to open the web UI at all. The existing downloadable report is
completely unaffected.

**`discoverSourceFiles` skips the whole `Unit tests` tree** (a new entry
in `EXCLUDED_DIR_NAMES`, alongside `node_modules`/`dist`/etc.) — belt and
suspenders alongside the existing filename-based `isTestFilePath` check,
and specifically guards against a root-level target run burning through
`MAX_DISCOVERED_FILES` on a repo's own previously-generated tests before
ever reaching real source files elsewhere.

## Consequences

- `runUnitTestGeneration`'s signature gained a `generatorType:
TestGeneratorType` parameter (previously it only received the resolved
  `JestTestGenerator` instance, with no way to know which registry key
  produced it) — `RunUnitTestGenerationUseCase` already has `run.generator`
  in scope, so this was a one-line call-site change.
- `GeneratedTestFile.testFilePath` now reflects the real nested location
  (e.g. `Unit tests/AI Based/src/foo.generated.test.ts`) rather than the
  old `src/foo.generated.test.ts` — the web UI just displays whatever
  string it's given, so nothing there needed to change.
- No database migration — this is purely a filesystem-layout change on
  whichever machine runs the job; nothing about the persisted domain
  model's shape changed.
