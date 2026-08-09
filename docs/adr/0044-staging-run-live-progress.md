# ADR-0044: Live progress for long-running staging runs

## Status

Accepted

## Context

Right after docs/adr/0043 (reconciling runs orphaned by a container
restart) shipped, the user reported a _different_ staging run that had
been going for 3+ hours with "not sure if anything is happening."
Investigation confirmed the job was genuinely alive — BullMQ's own
lock was still being renewed (`processedOn` matched the DB row's
`startedAt`, no stall detected) — but there was no way to tell that
from the outside. `runSubprocess` (`packages/plugins/shared`) only
buffers a spawned subprocess's stdout/stderr in memory and returns it
once the whole thing exits; nothing is visible anywhere — not in
Railway's logs, not in the DB, not in the UI — until the run finishes.
A genuinely healthy multi-hour run (454 real browser tests, each with
real page loads and the suite's own hardcoded `SLOW_MO = 400`ms
per-action delay) was indistinguishable from a truly hung one.

The user's ask, directly: "there should be a progress bar which should
at least show % completion."

## Decision

**`runSubprocess` gains optional `onStdout`/`onStderr` callbacks**,
fired alongside its existing buffering (not instead of it — the
buffered `SubprocessResult` is unchanged for every other existing
caller). `PytestStagingTestRunner` wires these to write live to this
process's own stdout/stderr for every step (clone, pip installs,
playwright install, pytest itself) — the simplest, lowest-risk fix:
Railway's log stream now shows real-time output instead of nothing for
hours.

**Real percentage, not just raw logs** — pytest's own default `-v`
output already right-aligns a running `[ NN%]` on every test outcome
line; no extra plugin or flag needed. `PytestStagingTestRunner` line-
buffers the pytest step's stdout (a percent marker can land split
across two separate `data` events) and reports a new percent only when
it changes. `StagingTestRunner.run()` gains an optional `onProgress`
parameter to carry this out of the adapter package; `RunStagingTestSuiteUseCase`
supplies a callback that persists it via a new
`QaAutomationRunRepository.updateProgress(orgId, id, percent)`, fired
and forgotten (a lost progress tick is not worth blocking the run's
real work on a DB round trip, unlike a lost test result).

**New `QaAutomationRun.progressPercent?: number`** field, only ever
set for a staging run — production's suite is short enough not to need
it. The web UI's run history shows a small progress bar next to the
status badge whenever `status === 'running'` and a percent is known;
`useQaAutomationRuns` polls every 5s while any run in the list is
`'running'`, mirroring `useScans`'s existing pattern.

## Consequences

- This makes "is it stuck" answerable at a glance going forward — the
  actual, underlying question from both this ADR and docs/adr/0043 in
  the same session.
- Doesn't address _why_ a full run can take multiple hours in the first
  place (the suite's own `SLOW_MO`/`HEADLESS=False` design, real page
  loads across 450+ tests) — only makes that reality visible instead of
  silent. If total runtime itself becomes the problem, that's a
  separate, later decision (e.g. parallelizing pytest, or asking the
  suite's maintainers to make `SLOW_MO` configurable).
- No change to `RunQaAutomationSuiteUseCase` (production) — it never
  takes long enough for this to matter, and `PortalAutomationTest` has
  no equivalent "percent so far" signal to parse.
