# ADR-0043: Reconcile QA automation runs orphaned by a container restart

## Status

Accepted

## Context

The user reported a staging run stuck showing "running" for many hours
with no result. Investigation against production found two
`QaAutomationRun` rows permanently stuck at `status: 'running'` —
one 23 hours old, one 8h45m old. The real BullMQ job underneath had
already failed on its own:

```
[qa-automation-staging] job 17 (org ...) failed: UnrecoverableError: job stalled more than allowable limit
```

Both `RunQaAutomationSuiteUseCase` and `RunStagingTestSuiteUseCase`
wrap their work in a try/catch that marks the run `'failed'` on any
in-process error (docs/adr/0035, docs/adr/0036) — but that only helps
for errors that happen _inside_ the running process. A Railway deploy
of `apps/qa-automation` sends the container a shutdown signal and,
after a grace period, kills it outright. If a run (especially a long
staging suite, now potentially taking hours since docs/adr's
`--continue-on-collection-errors` fix made it actually execute the
whole real suite instead of aborting near-instantly on the first
broken file) is still in flight when that happens, the entire Node
process is terminated mid-execution — no catch block anywhere in this
codebase can run after the process itself is gone. The run is left
stuck at `'running'` forever, with nothing in the DB or UI ever
indicating something went wrong.

This isn't a one-off: any future deploy of this service while a run is
active reproduces it exactly the same way.

## Decision

**Startup reconciliation, not smarter in-process error handling** —
the failure mode is a killed process, so nothing running _inside_ that
process can protect against it. Instead, `apps/qa-automation/src/main.ts`
runs `ReconcileOrphanedQaAutomationRunsUseCase` once at boot, before
either BullMQ worker starts accepting jobs. Since each queue processes
one job at a time, any `QaAutomationRun` still `'running'` when the
process starts fresh cannot possibly still be legitimately in progress
— it's unconditionally marked `'failed'`, and one summary alert email
lists every run that got reconciled this way (environment, id,
original start time) so a restart-during-a-run is never silent again.

**New port method, not a raw query from the app layer** —
`QaAutomationRunRepository.findAllRunning()` is system-wide (not
org-scoped, unlike every other method on this port), since
reconciliation happens before the worker knows anything about which
org's job was in flight.

## Consequences

- Deploying `apps/qa-automation` while a run is active still loses that
  run's real result — this doesn't make deploys safe to do mid-run, it
  just makes the failure visible (an alert email + an accurate
  `'failed'` status) instead of a silent, permanently-stuck row.
- The two runs already stuck in production self-heal on the next
  deploy of this fix, with no separate manual DB fix needed.
- If avoiding the data loss itself (not just surfacing it) becomes
  important later, the real fix is elsewhere — e.g. a longer graceful-
  shutdown grace period, or checkpointing partial staging results as
  they arrive rather than only at the very end.
