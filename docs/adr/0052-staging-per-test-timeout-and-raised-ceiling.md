# ADR-0052: Per-test timeout in the staging suite, and a raised hard ceiling

## Status

Accepted

## Context

Right after docs/adr/0045's 3-hour hard ceiling shipped, a real staging
run reached 81% (400+ of 511 tests already passed) and then sat
completely silent on a single test for 20+ minutes. Because
`RunStagingTestSuiteUseCase` only persists test results after the whole
pytest subprocess exits (docs/adr/0036), the only existing recovery path
was waiting out the full 3-hour kill and then discarding every
already-completed result — the user's own words, "total waste of
execution."

`curatal_tests` had no per-test timeout at all: no `pytest-timeout`
plugin, no `--timeout` flag. A single hung test could block the entire
run indefinitely (up to the 3-hour ceiling), rather than failing on its
own and letting the suite continue.

Adding `pytest-timeout` (`curatal_tests` PR #11, `--timeout=600`, method
left unspecified so Railway's Linux container gets the reliable `signal`
mechanism rather than Windows' weaker `thread` fallback) fixed exactly
this: confirmed live the very next run, a genuinely stuck test
(`TC_PANELADMIN_049`, which had legitimately taken 20-30+ minutes in the
prior run) was caught, marked as an error, and the suite carried on to
the next test automatically — no manual intervention.

But the same run then still got killed by the _outer_ 3-hour ceiling
before finishing, at 82%, 3h12m in. Per-test timeout only bounds a
single test's own execution; it can't help when the sum of 511 real
tests' legitimate durations exceeds the outer ceiling on its own. Two
consecutive live runs on 2026-08-13 both took 3h12m+ to reach ~82%,
confirming the 3-hour figure — chosen when this ceiling was first added,
based on the fastest healthy stretch observed at the time — was too
tight for the suite's actual current size and pace, independent of
whether any individual test hangs.

## Decision

**Keep the outer ceiling — raise it, don't remove it.** It exists
specifically because two earlier runs hung completely silently for 2+
hours each, unrelated to any single test (a stall between tests, or
below pytest's own event loop) — a failure mode per-test timeout cannot
catch. Removing it entirely would leave a genuine future silent hang
unbounded, burning Railway compute indefinitely with no recovery path.

`MAX_PYTEST_DURATION_MS` (`packages/staging-test-runner/src/pytest-staging-test-runner.ts`)
raised from 3 hours to 6 hours — comfortably above every real full-suite
duration observed so far (including a run that hit a pytest-timeout-caught
hang partway through and still needed more than 3 hours to reach 82%),
while still bounding a genuine silent hang to a finite, known worst case.

## Consequences

- The two mechanisms are complementary, not redundant: per-test timeout
  (`curatal_tests`) catches a single stuck test and keeps the suite
  moving; the outer ceiling (this ADR) catches a hang the per-test
  mechanism structurally cannot see, and now gives a healthy run enough
  room to actually finish.
- 6 hours is still a guess bounded by two data points, not a
  mathematically derived figure. If the suite grows further or its real
  pace shifts, this constant will need revisiting again — same caveat
  docs/adr/0045 carried forward from its own original choice.
- Doesn't address why individual tests (`TC_PANELADMIN_049` twice, at
  the same point in the suite both times) run pathologically slower than
  every other test in the same file — worth a separate investigation in
  `curatal_tests` if the pattern keeps recurring, since it may be a real
  app-side issue rather than pure environmental noise.
