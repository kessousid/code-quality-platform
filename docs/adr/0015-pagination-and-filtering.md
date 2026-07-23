# ADR-0015: Pagination and filtering convention

## Status

Accepted

## Context

Findings and reports are both list endpoints that will grow unbounded per
repo over time (ADR-0009 already flagged `FindingHistory` as unbounded).
Every list endpoint needs the same shape of answer — how many results,
which page, what filters applied — and that shape should be decided once,
not per-endpoint.

## Decision

**Offset-based pagination**, not cursor-based. Cursor pagination is the
better choice at real scale (stable under concurrent inserts, no
"page N is expensive" problem), but it's meaningfully more complex to
implement and consume, and nothing about this platform's current list
sizes demands it yet. Revisit if a repo's finding count grows large enough
that offset pagination's `COUNT(*)` cost or page-drift becomes a real
problem — not before.

Every paginated endpoint takes `page` (1-indexed, default 1) and `pageSize`
(default 25, max 100 — enforced, not just documented) and returns:

```ts
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

**Filtering is always a set of optional query parameters validated by a
DTO with class-validator**, never free-form query strings parsed by hand.
`GET /findings` is the concrete instance: `severity`, `status`, `category`,
`repoId` — each optional, each validated against the same enums the
domain types define, so an invalid filter value is a 400 at the boundary,
not a query that silently returns zero rows.

## Consequences

- `total` requires a `COUNT(*)` alongside every list query — an extra
  round trip Prisma issues automatically via `$transaction([findMany,
count])`. Acceptable now; worth revisiting (e.g., approximate counts) only
  if it shows up as a real latency problem.
- Every future list endpoint (reports, patches, scans) reuses this same
  `PaginatedResult<T>` shape and query-DTO pattern — this ADR is the
  template, `GET /findings` is Phase 6's proof it works, not a one-off.
