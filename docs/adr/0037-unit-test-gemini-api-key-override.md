# ADR-0037: Per-developer Gemini API key override

## Status

Accepted

## Context

The Gemini-backed generator (docs/adr/0024, docs/adr/0026) depends on a
single API key configured once per worker (`GEMINI_API_KEY`). A free-tier
key's daily/per-minute quota can run out mid-session with no warning
until the next request 429s — at which point every subsequent run fails
until the user notices and either waits for the quota to reset or swaps
the configured key and redeploys/restarts the worker. The user asked for
a faster way to keep working: supply a different key for the runs that
need it, without touching worker configuration at all — and, once told
that would mean re-entering a key on every single run, asked for a
one-time-per-developer setup instead ("done by a click of a button"),
not something retyped on every generate.

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

**The web UI persists the override client-side, not per-run.**
`GenerateUnitTestsSection` saves it to `localStorage` under
`cqp:geminiApiKeyOverride` — the same "remember it, don't ask again"
pattern DashboardPage already uses for `LAST_WORKER_ID_KEY`, on the same
reasoning: a developer's override key is effectively constant across
every run they do from this browser. The flow is one click to start
("Set a custom Gemini API key"), type once, one click to commit ("Save")
— from then on every Gemini run on that browser silently includes it
until "Clear" is clicked, with no per-run field to fill in at all.

## Consequences

- No database migration — this is the rare case where the right answer
  to "should this be a column" is no.
- The override is a manual escape hatch, not an automatic failover — if
  the default key is out of quota, the run still fails first; the
  developer then saves an override and retries. Automatic multi-key
  failover was considered and rejected as unnecessary complexity for a
  problem that, in practice, happens rarely enough to notice and fix
  once per developer.
- Same tradeoff as any browser-stored secret: it's visible in
  `localStorage`/the Network tab on that machine. Acceptable here since
  it's the developer's own key, saved by the developer, on their own
  browser — same trust boundary this app already accepts for
  `LAST_WORKER_ID_KEY`.
- Scoped to one browser, not one person — a developer using two browsers
  (or clearing site data) saves it twice. Accepted as the same tradeoff
  `LAST_WORKER_ID_KEY` already lives with; a real per-account setting
  would need a backend column, reopening the "should this be persisted
  server-side" question this ADR deliberately answers "no" to.
