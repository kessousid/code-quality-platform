# ADR-0054: Temporarily disable the test_paneladmin.py batch, raise per-batch timeout to 5h

## Status

Accepted

## Context

docs/adr/0053 split the staging run into two independent pytest batches
(everything except `test_paneladmin.py`, then `test_paneladmin.py` alone)
so a slow/hung stretch in one batch couldn't destroy the other's already-
collected results. That part worked as designed. But `test_paneladmin.py`
itself is still the file every real stall has happened in, and the user
wants to stop spending multi-hour runs re-confirming that same problem
before it's actually investigated. They asked to see a clean result from
the rest of the suite first, without `test_paneladmin.py` in the picture
at all, before running it again.

Separately, docs/adr/0053's per-batch ceiling (reverted to the original
3h figure, now applied per-batch instead of to the whole suite) hadn't
yet been validated against a real batch-1-only duration.

## Decision

- Added `RUN_PANELADMIN_BATCH = false` in `PytestStagingTestRunner`.
  While `false`, batch 2 (`test_paneladmin.py`) does not run at all —
  the staging run reports only batch 1's (~400 tests) results, and
  batch 1's progress reporting maps to the full 0-100% range instead of
  0-79%. Flip back to `true` once `test_paneladmin.py` itself is ready
  to be revisited (see docs/adr/0053's still-open "worth a real
  investigation" note).
- Raised `MAX_PYTEST_DURATION_MS` from 3h to 5h. This is a per-batch
  ceiling (docs/adr/0053), not a whole-suite one — a materially
  different, more generous number than it looks despite matching an
  earlier value from docs/adr/0045/0052's whole-suite era.

## Consequences

- Staging runs will not exercise `test_paneladmin.py` at all until this
  is reverted — its ~107 tests are simply absent from every report,
  not failing or skipped-and-counted. Anyone reading a staging report
  during this window needs to know that file isn't covered.
- The real question of why `test_paneladmin.py` runs pathologically
  slowly (docs/adr/0052's closing note, still unresolved) remains
  unresolved — this only removes it from the run, it doesn't fix it.
