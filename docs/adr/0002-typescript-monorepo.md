# ADR-0002: TypeScript monorepo (pnpm workspaces + Turborepo)

## Status

Accepted

## Context

The platform needs an API service, a background worker, a set of analyzer
plugins, an AI enrichment layer, a reporting engine, and a React dashboard.
The initial technology support list (JS/TS/React/Next.js/Node/Express) is
itself entirely TypeScript-compatible, and several plugin adapters (ts-morph,
typescript-eslint) are native TS/Node tools.

## Decision

Single TypeScript monorepo using pnpm workspaces for package management and
Turborepo for task orchestration/caching.

Top-level layout (detailed in Phase 2):

- `apps/api` — REST API (NestJS)
- `apps/worker` — scan worker consuming the job queue
- `apps/web` — React + TypeScript dashboard
- `packages/core` — Finding schema, plugin interfaces, scan orchestrator
- `packages/plugins/*` — one package per analyzer adapter
- `packages/ai` — LLM provider abstraction + correlation/enrichment logic
- `packages/reporting` — report generators (HTML/PDF/JSON/SARIF)
- `packages/db` — Prisma schema + generated client, shared by api/worker

## Consequences

- Finding schema, plugin interfaces, and DB types are shared via workspace
  packages with no publish step — a schema change is felt immediately by
  every consumer at typecheck time.
- One CI pipeline, one lockfile, one Node version to manage.
- Non-TS future plugins (e.g., a hypothetical Python-specific structural
  analyzer) run as a child process invoked from a thin TS adapter — the same
  pattern already used for Semgrep/gitleaks/jscpd, so this is not a special
  case, just another adapter.
- Turborepo remote caching becomes important once CI time grows; deferred
  until it's actually slow.
