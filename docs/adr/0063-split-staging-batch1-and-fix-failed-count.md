# ADR-0063: Split staging batch 1 into three sub-batches; fix inflated "failed" counts in report emails

## Status

Accepted

## Context

The 2026-09-03 18:30 UTC scheduled staging run reported only 364 of the
suite's usual ~520+ tests, with a subject line claiming "139 of 364
test(s) failed." Both numbers needed real investigation, not a guess.

**Why only 364 ran.** Batch 1 (everything except `test_paneladmin.py`,
~420 tests) hit its 5-hour hard timeout almost to the second (started
18:30:06, killed 23:30:09) and never finished. The last real test
activity was at 20:22:22 UTC; after that, complete silence for over 3
hours until the timeout fired. Only 262 of batch 1's 420 tests got a
recorded result (via the existing report-log partial-recovery,
docs/adr/0057) — the other 158 never ran at all. Batch 2 (Panel Admin,
98 tests) ran separately afterward and finished cleanly in 47 minutes.
262 + 98 ≈ 364.

**Why the failures clustered the way they did.** Grouping the 125 real
failures by error signature: 124 of 125 were Playwright-level errors
(`TimeoutError` or a bare `Error`, e.g. `BrowserContext.new_page: Target
crashed`), not application-logic assertion failures — the signature of
infrastructure strain, not 125 independent product bugs. 63 were in the
`cod` persona area specifically, spread across **ten different
files/classes** (admin, master_recruiter, and standalone `cod` test
modules) — too broad to be one broken fixture in the newly-added `cod`
suite (an earlier hypothesis that didn't hold up under closer
inspection). `browser` is pytest-playwright's session-scoped fixture:
**one single Chromium process was shared across all ~420 of batch 1's
tests**, however long the whole batch took. This run needed its full 5h
budget instead of the normal ~2.5-3h, sustaining that one browser
process far longer than usual — consistent with the process itself
degrading under load, not a code defect in any specific persona's tests.

**Why "139 failed" overstated it.** Separately, a real reporting bug:
`RunStagingTestSuiteUseCase` (and identically
`RunQaAutomationSuiteUseCase` for production) computed
`results.filter((r) => !r.passed)` for the report email's subject/body —
counting real skips and quarantined-test stubs (docs/adr/0055) as
"failed." 125 real failures + 10 real skips + 4 quarantine stubs = 139.
This is the exact class of bug already fixed for the dashboard and the
Excel/PDF report Summary sections in mid-August — that earlier fix
simply missed these two report-email call sites.

## Decision

**Batch 1 split into three independent sub-batches** (mirroring batch
2's existing split from the rest of the suite, docs/adr/0053),
implemented in `packages/staging-test-runner/src/pytest-staging-test-runner.ts`:

- `BATCH1_SUB_BATCHES`: three groups of `tests/roles/*` directories
  (plus `tests/EndToEnd` and every loose top-level/`panel_admin`-debug
  file the old bare `'tests'` path used to pick up), balanced by rough
  per-directory test-function count — `batch1a`
  (scheduling_admin, EndToEnd, employer), `batch1b` (cod, candidate),
  `batch1c` (coach, mentor, admin, interviewer).
- Each sub-batch runs as its own `runBatch`/`runPytest` call — its own
  fresh `browser` process, its own `try`/`catch` (a total loss in one
  sub-batch no longer aborts the others), and its own progress-percent
  slice of batch 1's overall weight.
- New `BATCH1_SUB_BATCH_TIMEOUT_MS` (2h) replaces the shared 5h ceiling
  for these three calls specifically — `runPytest`/`runBatch` gained an
  optional `timeoutMs` parameter (defaulting to the existing
  `MAX_PYTEST_DURATION_MS`) rather than a second hardcoded constant
  scattered through the method. Worst case if all three sub-batches
  independently hang is now ~6h total instead of one sub-batch silently
  consuming the old single 5h ceiling and losing everything after it.
- `QUARANTINED_BATCH1_TESTS`' two node IDs both live under
  `tests/roles/cod/master_recruiter/`, so their `--deselect` flags moved
  to `batch1b` specifically instead of the old single batch-1 call.

**Report-email failed-count fix**, in both
`run-staging-test-suite.use-case.ts` and
`run-qa-automation-suite.use-case.ts`: `failing` now excludes anything
with the `SKIPPED:` details prefix (`isSkippedTestResult`, `@cqp/core`)
— the same helper and the same split already applied to the dashboard
and Excel/PDF reports. A skip and a quarantine stub both use that
prefix, so one check correctly excludes both from the numerator without
needing a second, separate quarantine check.

## Consequences

- Batch 1 now runs as 4 independent subprocess invocations end to end
  (1a, 1b, 1c, then batch 2) instead of 2 — more clone/install
  overhead per run (each sub-batch re-clones and reinstalls
  dependencies, same as batch 2 already does today), traded for
  bounded blast radius when something goes wrong.
- The three-way grouping is a best-effort balance from a rough
  per-directory test count, not an exact one — worth rebalancing if the
  suite's own directory sizes drift enough to make one sub-batch
  noticeably longer than the other two.
- The explicit file paths for loose top-level/`panel_admin`-debug files
  carry the same fragility already documented for `PANELADMIN_FILE`
  (docs/adr's own note on that): if `curatal_tests` renames or moves one
  of these files without notice, pytest will error on that missing path
  rather than silently continuing.
- This is a mitigation for the _browser-process-under-load_ failure
  mode, not a fix for whatever underlying resource pressure or
  Chromium-level issue caused it — if a sub-batch itself starts hitting
  the same "Target crashed" pattern at its own smaller scale, that's
  worth investigating further rather than just re-splitting again.
- Live verification happens via the next scheduled run (this class of
  orchestration logic isn't unit-tested in this file, matching this
  package's existing practice of relying on real live-run verification
  for the subprocess-driven parts).
