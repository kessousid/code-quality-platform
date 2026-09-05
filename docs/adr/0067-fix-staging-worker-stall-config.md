# ADR-0067: Fix backwards `maxStalledCount: 0` on the staging BullMQ worker

## Status

Accepted

## Context

The user ran the staging suite manually and it failed. Investigation
traced it to a deploy, not a test problem: pushing docs/adr/0065 and
docs/adr/0066's commits triggered a Railway auto-deploy, restarting the
`qa-automation` container at 2026-09-05T03:58:16Z while the user's
manual run (BullMQ job 132) was still in progress. A container restart
kills the Node process and, with it, the in-flight `pytest` subprocess —
there's no graceful handoff for an active job. So far, unsurprising: a
deploy always kills whatever's running.

What made the failure confusing was `packages/queue/src/qa-automation-staging-queue.ts`'s
worker config: `stalledInterval: 2h`, `maxStalledCount: 0`. The comment
above it (docs/adr/0036) said the intent was _"a generous lock duration
and no stalled-job timeout keep a long-but-healthy run from ever being
mistaken for a stuck one."_ Reading BullMQ's actual stall-detection logic
directly (`moveStalledJobsToWait-9.lua`) shows this is backwards: a job
is only hard-failed once `stalledCount > maxStalledCount`. With `0`, the
very _first_ stall detection already exceeds it — zero tolerance, not
"no timeout." Confirmed by the timeline: the container restarted at
03:58:16Z; the _next_ stalled-job check (only run every `stalledInterval`
= 2h) fired at 05:58:26Z — 2h00m10s later — found job 132's lock gone
(the process that held it was dead), and immediately, permanently failed
it with `UnrecoverableError: job stalled more than allowable limit`. The
user found out about an ordinary deploy interruption over two hours
after the fact, as a hard failure with no retry.

## Decision

`packages/queue/src/qa-automation-staging-queue.ts`,
`createQaAutomationStagingBullWorker`:

- `maxStalledCount: 0` → `1` (BullMQ's own default). Gives a job one
  automatic retry when its lock is found genuinely missing. Safe
  specifically for this failure mode: if the whole container died (a
  deploy, a crash), there's no live old process left to collide with the
  retry — the concern that normally makes bumping `maxStalledCount`
  risky (retrying a merely-slow-but-still-alive job, causing two
  concurrent attempts) doesn't apply here.
- `stalledInterval: 2h` → `5 minutes`. This only controls how _often_
  the stalled-check runs, not how long a healthy job's lock survives —
  that's `lockDuration`, left unchanged at 2h, and BullMQ auto-renews a
  live job's lock well before that regardless of how often the checker
  looks. Checking more often doesn't raise the false-positive rate on a
  healthy run; it only shortens how long a genuinely orphaned job (this
  scenario, or a real crash) sits undetected before being retried.

`packages/queue/src/qa-automation-queue.ts` (production) was checked and
left alone — it never overrode these options, so it already runs on
BullMQ's own defaults (`maxStalledCount: 1`, `stalledInterval: 30s`),
which don't have this problem.

## Consequences

- A future deploy that lands while a manual or scheduled staging run is
  active will still kill that run's process, but the job will now retry
  automatically within ~5 minutes instead of sitting silently failed for
  up to 2 hours. The retried attempt starts the whole suite over from
  scratch (no resume support) and creates its own new
  `QaAutomationRun` row; the interrupted attempt's row is still cleaned
  up by the existing orphaned-run sweep on the next process start,
  unchanged by this fix.
- Separately, worth deciding whether to avoid deploying while a staging
  run is known to be active in the first place, rather than relying on
  retry-after-the-fact — not addressed here.
- Not unit-tested (no existing test file for this package's queue
  wiring) — verification is via the next deploy-during-a-run collision,
  same as this repo's general practice for its subprocess/job-queue
  orchestration code.
