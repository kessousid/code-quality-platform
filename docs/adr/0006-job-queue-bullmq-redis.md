# ADR-0006: Background job queue — BullMQ + Redis

## Status

Accepted

## Context

Scans are long-running (checkout, N plugins, graph build, correlation, AI
enrichment, report generation) and must be resumable/observable, not
request-response. Candidates: BullMQ+Redis, RabbitMQ, AWS SQS, `pg-boss`
(Postgres-backed queue, no new infra), Temporal (durable workflow engine).

## Decision

BullMQ + Redis for the job queue in `apps/worker`.

`pg-boss` was the closest alternative — it avoids adding Redis as a second
stateful dependency alongside Postgres, which matters for MVP ops
simplicity. It loses out because BullMQ has materially better job
observability (Bull Board), finer-grained retry/backoff/rate-limit
primitives, and first-class NestJS integration (`@nestjs/bullmq`) — all of
which matter more here than infra minimalism, because a scan job is a
multi-stage pipeline (plugins → graph → correlation → AI → report) that
needs per-stage progress and retry, not just "job done/failed."

Temporal was rejected for MVP: it solves durable multi-step orchestration
extremely well, but its own server + datastore is a heavy addition before
the pipeline complexity actually demands it. Revisit if scan pipelines grow
enough steps/branching that BullMQ's job-chaining (flows) becomes unwieldy.

Redis is not single-purpose here — it will also back rate limiting and
caching later, so it is not "infra added only for the queue."

## Consequences

- One more stateful service to run/deploy (Redis) beyond Postgres — captured
  in the Phase-5 docker-compose for local dev.
- Job payloads and results must stay small (scan metadata + object-storage
  keys, not full Finding arrays) — Redis is not the source of truth,
  Postgres is; the queue only carries "what to do," not "what was found."
- Retry/backoff policy per plugin is a real design surface for Phase 5
  (service architecture), since a plugin timeout (e.g. Semgrep on a huge
  monorepo) should not fail the whole scan.
