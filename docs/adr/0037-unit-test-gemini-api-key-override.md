# ADR-0037: Per-run Gemini API key override

## Status

Accepted

## Context

The Gemini-backed generator (docs/adr/0024, docs/adr/0026) depends on a
single API key configured once per worker (`GEMINI_API_KEY`). A free-tier
key's daily/per-minute quota can run out mid-session with no warning
until the next request 429s — at which point every subsequent run fails
until the user notices and either waits for the quota to reset or swaps
the configured key and redeploys/restarts the worker. The user asked for
a faster way to keep working: type a different key in for just the runs
that need it, without touching worker configuration at all.

## Decision

**`CreateUnitTestRunInput` gains an optional `apiKeyOverride`, but it is
deliberately never persisted.** `UnitTestRun` (the read model returned by
every endpoint) has no such field, and `CreateUnitTestRunUseCase`
destructures it out of the object handed to
`unitTestRunRepository.create()` — it only continues on into the enqueued
`UnitTestJobData`, which is the one place `run-unit-test-generation.job.ts`
reads it back out (`data.apiKeyOverride ?? process.env.GEMINI_API_KEY`) to
construct that run's `GeminiJestTestGenerator`. A raw secret that never
needs to outlive a single run has no reason to sit in Postgres, so it
doesn't.

The one place it does briefly exist outside the request/response cycle is
the BullMQ job payload in Redis — `BullMqUnitTestQueue.enqueue()` now
passes `removeOnComplete: true, removeOnFail: true` so that record is
deleted the moment the job finishes either way, rather than lingering at
whatever retention BullMQ defaults to. Nothing downstream needs the job's
own Redis record afterward; the run's real status/results already live in
Postgres.

The web UI shows a single optional, `type="password"` field ("Custom
Gemini API key") next to the existing generator radio choice, visible
only when Gemini is selected — left blank, behavior is identical to
today.

## Consequences

- No database migration — this is the rare case where the right answer
  to "should this be a column" is no.
- The override is a manual, per-run escape hatch, not an automatic
  failover — if the default key is out of quota, the run still fails
  first; the user then retries with an override. Automatic multi-key
  failover was considered and rejected as unnecessary complexity for a
  problem that, in practice, happens rarely enough to notice and retry.
- Same tradeoff as any browser-entered secret: it's visible in the
  Network tab / browser memory for that request. Acceptable here since
  it's the user's own key, entered by the user, for their own run.
