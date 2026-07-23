# ADR-0009: Database schema design — persistent findings, denormalized tenancy, graph stays out of Postgres

## Status

Accepted

## Context

Phase 1's `Finding` TS type (`packages/core/src/finding.ts`) has `scanId`,
`firstSeenScanId`, and `lastSeenScanId` side by side, which is ambiguous
until a real decision is made: is a `Finding` a fresh row every time a scan
re-detects the same issue, or one persistent row whose lifecycle spans many
scans? This has to be settled before the schema can be written, because it
changes what the correlation engine (Phase 8) and the trends view
(Phase 10) actually query.

## Decision

**`Finding` is a persistent entity, not a per-scan snapshot.** One row per
logical issue, scoped to a `Repo` (not a `Scan`). The correlation engine
computes a `fingerprint` (rule + location + code-shape derived) to recognize
"this is the same issue as last scan" and updates the existing row rather
than inserting a new one. `firstSeenScanId`/`lastSeenScanId` track its
lifecycle; `status` (open/fixed/ignored/false-positive) is mutable state on
that one row.

Per-scan observations are a separate table, `FindingHistory`: one row per
(finding, scan) pair recording status/severity _at that scan_. This is what
trend charts and "was this fixed then reopened" queries read — `Finding`
itself only holds current state.

**Clarifies Phase 2's `Finding` TS type**: the `scanId` field is not a
stored DB column. It's populated at the API serialization layer (Phase 6)
with whichever scan is the current viewing context — `lastSeenScanId` when
viewing "current findings," or the specific historical scan ID when viewing
a past scan's `FindingHistory` entry rendered back into the same shape.

## Other decisions

- **`org_id` denormalized on every tenant-scoped table**, not just reachable
  via joins (e.g. `Finding.orgId` alongside `Finding.repoId`, even though
  `Repo` already has an `orgId`). Per ADR-0003, tenant-scoped queries filter
  on `org_id` directly without an extra join on every request — cheap now,
  and it's what row-level security (deferred, ADR-0003) would enforce on
  this same column later.
- **The dependency/architecture graph is not modeled as Postgres rows.**
  `Scan.dependencyGraphStorageKey` points to an object-storage blob (JSON),
  consistent with the architecture overview's storage split (Postgres =
  findings/scans/reports metadata, object storage = scan artifacts/reports).
  Revisit only if the correlation engine needs to run relational/recursive
  queries directly over graph structure rather than loading it into memory
  once per scan.
- **Prisma enums stay inside `packages/db`.** `packages/core`'s `Severity`/
  `Confidence`/`AnalysisCategory`/etc. remain plain string-literal unions
  (per ADR-0002/0005, the domain layer stays framework-free). `packages/db`
  exports mapper functions between its Prisma enums and core's string
  literals — the DB schema's enum choice never leaks into `packages/core`.
- **IDs are `cuid()`, not auto-increment integers.** Non-sequential IDs
  aren't guessable/enumerable — a small but free hardening choice for a
  security-focused product to make by default rather than after an audit
  finds sequential-ID enumeration as a finding of its own.
- **`User` belongs to exactly one `Org`** for MVP (no membership join
  table). Consistent with ADR-0003 deferring real multi-tenancy — this is
  the schema-level simplification that ADR accepted; revisit alongside the
  rest of that deferred work if a user ever needs multi-org membership.

## Consequences

- The correlation engine's fingerprinting logic (Phase 8) is load-bearing:
  a bad fingerprint means duplicate `Finding` rows for the same issue across
  scans, defeating the whole "track lifecycle, don't re-report" point of
  this schema. Worth a dedicated test suite when Phase 8 implements it.
- `FindingHistory` grows one row per (finding, scan) — unbounded over a
  repo's lifetime. Acceptable for MVP; a retention/rollup policy is a
  problem for whenever it's actually large, not now.
