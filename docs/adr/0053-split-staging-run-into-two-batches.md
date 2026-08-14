# ADR-0053: Split the staging run into two independent batches

## Status

Accepted

## Context

docs/adr/0052 raised the staging suite's hard timeout from 3 hours to 6
hours after a run correctly caught an individual hung test (via
`curatal_tests`' new pytest-timeout) and kept going, but still got
killed by the outer ceiling before finishing. That fix didn't actually
solve the problem: a third live run on 2026-08-13/14 still got killed —
this time at 85% after the full 6 hours, discarding every
already-completed result exactly as before. Raising the number again
would just move the same wall further out without addressing why it
keeps getting hit.

All three real runs that hit the outer ceiling (or came close) stalled
or ran unusually slowly in the same place: somewhere in the 74-85%
progress range. `tests/test_paneladmin.py` — the single largest file in
the suite at ~107 of ~512 tests (~21%) — sits exactly in that range of
the collection order. One giant single-pytest-invocation ceiling shared
across the whole suite means a slow stretch anywhere (confirmed
concentrated in this one file) eats into the time budget every other
test needs too, regardless of how generous that ceiling is.

## Decision

**Split the run into two independent pytest invocations instead of
one**, in `PytestStagingTestRunner.runSuite()`:

1. Everything except `test_paneladmin.py` (`--ignore=tests/test_paneladmin.py`, ~79% of tests)
2. `test_paneladmin.py` alone (~21% of tests)

Each batch gets its own `MAX_PYTEST_DURATION_MS` ceiling (reverted to 3
hours — the original figure, now applied per-batch instead of to the
whole suite) and its own try/catch: a batch that times out or crashes
is logged and skipped, not allowed to abort the other batch or discard
its already-collected results. Progress is reported proportionally
(batch 1 maps to the first ~79% of the overall percent, batch 2 to the
remaining ~21%) so the existing live-progress UI (docs/adr/0044) still
shows one continuous 0-100% run. Results from both batches are merged
into the same `StagingTestResult[]` returned to
`RunStagingTestSuiteUseCase` — no schema, DB, or UI changes needed; the
rest of the stack still sees one run producing one result set.

Only if _both_ batches produce zero results does the run fail outright.

## Consequences

- A slow or hung stretch inside `test_paneladmin.py` can no longer
  starve the ~400 tests in the rest of the suite, and vice versa — each
  batch's timeout is sized for its own realistic duration instead of
  sharing one ceiling sized for the whole suite's worst case.
- If `test_paneladmin.py` itself keeps being disproportionately slow,
  this doesn't fix _why_ — it only stops that slowness from destroying
  unrelated results. Worth a real investigation in `curatal_tests` if
  the pattern keeps recurring (see docs/adr/0052's own closing note,
  still unresolved).
- Setup (`git clone`, `pip install`, `playwright install`) still runs
  once per staging run, not once per batch — both pytest invocations
  reuse the same cloned `repoDir`. Only the pytest command itself is
  split in two.
- The 79/21 split is sized to `test_paneladmin.py`'s current test count
  specifically; if the suite's file sizes shift meaningfully, this
  split point (and the progress-percent scaling) will need revisiting.
