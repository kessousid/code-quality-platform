# ADR-0046: A skipped staging test counts as failed, not passed

## Status

Accepted — reverses part of docs/adr/0036

## Context

docs/adr/0036 deliberately stamped a real pytest `skip` outcome as
`passed: true` (with a `SKIPPED: <reason>` details prefix so it could
still be told apart from a genuine pass) specifically so a skip would
never trigger a false failure alert email. Per the user, that trade-off
is reversed: a skipped test should be marked failed, full stop —
skips are now a real, first-class signal that something needs
attention, not a silent no-op.

## Decision

**`parseJunitXml`'s skip branch now stamps `passed: false`** — this
single change is the source of truth; everything downstream inherits
it automatically without needing to know about skips specifically:

- `RunStagingTestSuiteUseCase`'s existing `results.filter((r) => !r.passed)`
  failure-alert logic now includes skips, so an alert email fires
  whenever anything is skipped, same as a real failure.
- `PdfQaAutomationReportGenerator`'s Passed/Failed counts and per-result
  `[PASS]`/`[FAIL]` labels are correct for skips with no code change —
  they only ever read `result.passed`.
- The web UI's run-results view (`QaAutomationPage.tsx`) shows a skip as
  `FAIL` for the same reason.

**The Excel generator (docs/adr's newly-added Failure & Skip Analysis
tab) needed explicit adjustment**, since it already had its own
skip-aware logic built the old way:

- Summary sheet: `Skipped` is now a pure breakout count, no longer
  subtracted out of `Failed` — a skip is counted in both.
- Test Results sheet: status shows `Fail (skipped)` rather than a bare
  `Skip`, so it still reads as a failure at a glance while remaining
  distinguishable from a non-skip failure.
- The "Failures by category" classification explicitly excludes skips
  (`!isSkipped(...)`) — a `SKIPPED: ...` string isn't a real traceback,
  and running it through `classifyFailureReason` would only add noise
  to the "Other / unclassified" bucket instead of the dedicated
  "Skipped tests" section, which already lists each one's real reason.

## Consequences

- A staging run that skips several tests but has zero real failures now
  sends a failure-alert email where it previously wouldn't have — a
  deliberate behavior change, not a bug.
- `RunQaAutomationSuiteUseCase` (production) is untouched — it has no
  concept of "skip" at all, since it doesn't run through pytest/JUnit
  XML.
