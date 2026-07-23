# ADR-0007: ORM / persistence layer — Prisma

## Status

Accepted

## Context

Candidates: Prisma (schema-first, generated client, migration engine),
Drizzle (lighter, closer to raw SQL, no separate query-engine binary),
TypeORM, Kysely, raw `pg`.

The platform's query patterns are two shapes: (1) ordinary CRUD over
orgs/repos/scans/findings, and (2) graph-ish queries for the dependency
graph and cross-scan correlation, which will need recursive CTEs or
multi-join queries that no TS query builder makes fully idiomatic.

## Decision

Prisma, for the CRUD majority of the schema, with an explicit rule for the
graph/correlation minority: recursive or complex queries go through
`prisma.$queryRaw` using **tagged-template parameterization only** — never
`$queryRawUnsafe` or string-built SQL.

Drizzle was the real alternative and is not a bad choice — it would give
slightly more direct SQL control for exactly the graph queries that are
Prisma's weak point, and drops the Rust query-engine binary. It loses out
for now on team velocity and ecosystem maturity (migration workflow,
Prisma Studio, broader hiring familiarity) which matter more pre-product-
market-fit than marginal query-ergonomics. Revisit if the correlation
engine's queries grow complex enough that `$queryRaw` escape hatches become
the majority of the data-access code rather than the exception.

## Guardrail — this is not optional

This platform's own first scan target (CuratalIT) has a real, confirmed SQL
injection finding from raw string interpolation into `sequelize.query()`
(see the Semgrep/Rudra comparison in the parent repo). Shipping the same
anti-pattern in the tool built to catch it would be a direct credibility
failure. Enforced two ways:

1. **ADR rule**: any raw SQL uses `$queryRaw`/`$executeRaw` tagged templates
   (auto-parameterized), never `$queryRawUnsafe`/`$executeRawUnsafe`.
2. **ESLint rule** (`eslint.config.js`, `no-restricted-syntax`): flags any
   `.$queryRawUnsafe(` / `.$executeRawUnsafe(` call as an error at lint
   time, not just a code-review convention.

## Consequences

- Prisma Migrate is the single source of truth for schema changes (Phase 4).
- `packages/db` is the only package that imports `@prisma/client` directly;
  `apps/api` and `apps/worker` depend on `@cqp/db`, never on Prisma directly,
  so a future ORM swap is contained to one package.
