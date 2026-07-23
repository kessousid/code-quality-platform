# Entity-Relationship Diagram (Phase 4)

Source of truth is `packages/db/prisma/schema.prisma`; this is a readable
companion to it. See `docs/adr/0009-database-schema-design.md` for why
`Finding` is persistent (not a per-scan row) and why `org_id` is
denormalized onto every tenant-scoped table.

```mermaid
erDiagram
  ORG ||--o{ USER : has
  ORG ||--o{ REPO : has
  ORG ||--o{ SCAN : has
  ORG ||--o{ FINDING : has
  ORG ||--o{ PATCH : has
  ORG ||--o{ REPORT : has

  REPO ||--o{ SCAN : has
  REPO ||--o{ FINDING : has

  SCAN ||--o{ FINDING_HISTORY : observes
  SCAN ||--o{ REPORT : produces
  SCAN }o--o| SCAN : "baseline for (incremental)"
  SCAN }o--o| USER : "triggered by"
  SCAN ||--o{ FINDING : "first seen in"
  SCAN ||--o{ FINDING : "last seen in"

  FINDING ||--o{ FINDING_LOCATION : has
  FINDING ||--o{ FINDING_REFERENCE : has
  FINDING ||--o| AI_FINDING_ENRICHMENT : has
  FINDING ||--o{ FINDING_HISTORY : has
  FINDING ||--o{ PATCH : has
  FINDING ||--o{ FINDING_CORRELATION : "source of"
  FINDING ||--o{ FINDING_CORRELATION : "target of"

  PATCH }o--o| USER : "PR created by (human gate, ADR-0004)"

  ORG {
    string id PK
    string name
    string slug UK
  }
  USER {
    string id PK
    string orgId FK
    string email UK
    string role
  }
  REPO {
    string id PK
    string orgId FK
    string name
    string provider
    string remoteUrl
  }
  SCAN {
    string id PK
    string orgId FK
    string repoId FK
    string ref
    string mode
    string status
    string baseScanId FK
    string dependencyGraphStorageKey "blob pointer, not relational"
  }
  FINDING {
    string id PK
    string orgId FK
    string repoId FK
    string category
    string severity
    string confidence
    string status
    string fingerprint "dedup key across scans"
    string firstSeenScanId FK
    string lastSeenScanId FK
  }
  FINDING_LOCATION {
    string id PK
    string findingId FK
    string filePath
    int startLine
  }
  FINDING_REFERENCE {
    string id PK
    string findingId FK
    string title
    string url
  }
  AI_FINDING_ENRICHMENT {
    string id PK
    string findingId FK "unique, 1:1"
    string plainEnglishExplanation
    string businessImpact
    string suggestedPatch
  }
  FINDING_CORRELATION {
    string id PK
    string findingId FK
    string relatedFindingId FK
    string reason
  }
  FINDING_HISTORY {
    string id PK
    string findingId FK
    string scanId FK
    string status "snapshot at this scan"
    string severity "snapshot at this scan"
  }
  PATCH {
    string id PK
    string orgId FK
    string findingId FK
    string diff
    string prUrl
    string prCreatedByUserId FK "non-null only if a human created the PR"
  }
  REPORT {
    string id PK
    string orgId FK
    string scanId FK
    string format
    string storageKey
  }
```

## Verified so far

- `prisma validate` passes.
- `prisma generate` produces a working, typed client (`@cqp/db` builds and
  typechecks against it).
- Migration SQL generated offline (no live DB needed to generate it) and
  committed at `packages/db/prisma/migrations/`.
- **Verified live against a real PostgreSQL 18 server** (2026-07-17): both
  migrations applied cleanly via `prisma migrate deploy` into an isolated
  `cqp` schema inside a dedicated database, kept fully separate from any
  application data. Exercised end-to-end through the real running API, not
  just the migration itself:
  - `POST /repos` → `POST /scans` → `GET /scans/:id` — real rows created
    and fetched, independently confirmed via direct SQL against the same
    tables the API wrote to.
  - `POST /scans` with a nonexistent `repoId` → real `404`, proving the
    Phase 6 tenant/existence check (ADR-0014) holds against live data, not
    just the in-memory fakes.
  - A garbage bearer token → real `401` from the DB-backed
    `ApiTokenGuard` (previously this could only be demonstrated as a `500`
    with no live DB — see BACKLOG.md Epic 6).
  - `docker-compose.yml`'s `cqp`/local-Postgres path is still the intended
    default dev setup; this verification used a separate, already-running
    Postgres instance instead. See `docs/architecture/dev-database.md` for
    how to reconnect to that same setup if needed again.
