# ADR-0057: Recover partial results from a batch that never finished

## Status

Accepted

## Context

A scheduled staging run on 2026-08-27 reported only 416 tests instead of
the usual ~525. Root cause, diagnosed live: `test_TC_PANELADMIN_076_
schedule_interview_select_slot_popup_contents` hung indefinitely — a new,
previously-unseen hang, unrelated to any test already on the
docs/adr/0055 quarantine list. The batch-2 hang-watchdog (docs/adr/0045)
correctly SIGKILLed the whole pytest subprocess after
`MAX_PYTEST_DURATION_MS` (5 hours, per docs/adr/0054). But pytest's
`--junitxml` report is only written when the pytest session exits
_normally_ — a SIGKILL mid-session means the file is never written at
all. `runBatch` (`PytestStagingTestRunner`) had no fallback: the entire
109-test panel-admin batch contributed **zero** results, not just the
hung test — every one of the ~75 tests that had already passed earlier
in that same run were discarded along with it, purely because there was
no incremental persistence.

Separately, `runSubprocess` (`packages/plugins/shared/src/run-subprocess.ts`)
already accumulates `stdout`/`stderr` from every live `data` event
throughout the run (that's how the docs/adr/0044 live-progress streaming
and the `[ NN%]` percent tracker already work) — but on the timeout path,
`SubprocessTimeoutError` took no stdout/stderr constructor args, so that
already-buffered data was discarded on the reject, too. A batch-timeout
failure carried almost no diagnostic signal beyond a one-line
`console.error`.

docs/adr/0053 already bounds a hang's blast radius to a single batch
(not the whole suite); this decision bounds it further, to genuinely
unfinished tests only.

## Decision

**Capture results incrementally via `pytest-reportlog` (added to
`curatal_tests/requirements.txt`) as a fallback source, used only when
the primary `--junitxml` report is unavailable:**

1. `runPytest` now also passes `--report-log=<path>` alongside the
   existing `--junitxml=<path>`. `pytest-reportlog` flushes one JSON
   line to disk per test-report event as it happens, so a SIGKILL only
   ever loses the one line that was mid-write, not everything before it.
2. A `SubprocessTimeoutError` no longer propagates as a thrown error
   past `runPytest` — it's caught and returned as a normal-shaped
   outcome (`timedOut: true`, with the real buffered `stdout`/`stderr`
   now preserved on the error itself). A timeout is just another way the
   subprocess can conclude, handled by the same downstream logic as a
   clean exit or a crash.
3. `runBatch` tries the JUnit XML first — **unchanged behavior on the
   clean-exit path, no new risk there.** Only if that file is missing
   does it fall back to reading and parsing the report-log file (new
   `report-log-parser.ts`, mirroring `junit-xml-parser.ts`'s shape and
   failure > error > skipped > pass precedence). Recovered rows are
   marked with a `[RECOVERED ...]` prefix on `details` (reusing the
   existing `SKIPPED:`-prefix-style string-marker convention rather than
   adding a new `StagingTestResult` field — keeps `SKIPPED:` as the
   leading token when present, since every existing
   `isSkippedTestResult`/`isQuarantinedTestResult` check anchors on that
   at position 0). Only if _both_ sources are empty does `runBatch`
   throw — and that error now includes real `stdout`/`stderr` tails
   instead of the old opaque "no report produced" message.
4. A nodeid whose `call`-phase report never arrived (the test that was
   still executing when the kill happened) is deliberately **excluded**
   from the recovered results, not fabricated as a pass or fail — its
   outcome is genuinely unknown.
5. `runSuite`'s per-batch try/catch is unchanged in structure, but now
   only fires on genuine total loss (both JUnit and report-log empty) —
   its log message says so explicitly, distinguishing that from the
   fallback path's own "recovered N results" log line inside `runBatch`.

## Consequences

- A future hang anywhere in a batch no longer destroys every
  already-passed result alongside it — the loss is now bounded to
  whatever was still in-flight when the kill happened, not the whole
  batch.
- Still doesn't fix the underlying hang itself — same framing as every
  prior decision in this series (0045, 0053, 0055, 0056 all separately
  note this only bounds the damage). `TC_PANELADMIN_076` was quarantined
  separately, the normal way, once found.
- `pytest-reportlog`'s JSON-Lines schema (`$report_type`, `when`,
  `outcome`, `longrepr`) is pytest-internal serialization, not a stable
  public contract — the same fragility class already accepted for exact
  test names in docs/adr/0055/0056. A future pytest major version could
  change field/shape without warning; `report-log-parser.ts` fails soft
  (drops an unparseable line, logs it) rather than throwing, but a
  wholesale schema change could silently reduce recovery to zero without
  an obvious error.
- Recovered results are visually distinguishable in the report (the
  `[RECOVERED ...]` details marker) but not yet a first-class
  filterable/countable metric. Deferred — a `recovered?: boolean` field
  on `StagingTestResult` plus a migration and report-generator updates
  is a reasonable follow-up if that visibility is ever actually needed,
  not built speculatively now.
- Pushes to `curatal_tests` (an external repo) do not trigger a Railway
  deploy of this repo's own services — the standing "check for an active
  run before pushing to `main`" rule applies to _this_ repo's `main`
  only.
