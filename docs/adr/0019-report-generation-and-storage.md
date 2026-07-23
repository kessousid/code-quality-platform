# ADR-0019: Report generation — shared report model, object storage port, format choices

## Status

Accepted

## Context

Phase 6 built the read side of reporting (`GET /reports/:id`, `GET
/scans/:scanId/reports`, `PrismaReportRepository`, `Report` domain type)
but nothing that actually produces a report. Three gaps block that:

1. **No object storage exists.** `Report.storageKey` and
   `Scan.dependencyGraphStorageKey` both point at it (ADR-0009), and the
   architecture overview's diagram shows it, but no port or adapter was
   ever built — Phase 6 only needed to read `storageKey` strings, never
   write one.
2. **`ReportRepository` has no `create` method.** Only `findById` and
   `listByScan` — because until now nothing generated a `Report` row to
   begin with.
3. **`FindingRepository` has no way to fetch "all findings for scan X."**
   `list()` is paginated and filters by `repoId`, not `scanId`. A report
   needs the complete, unpaginated set.

## Decision

### Object storage

Add an `ObjectStorage` port to `packages/core` (`put`/`get`/`exists`),
following the same port-in-core/adapter-in-its-own-package pattern as
every repository (ADR-0010). Implement one adapter for now,
`LocalFilesystemObjectStorage` in a new `packages/storage` — writes under
a configurable root directory (`CQP_STORAGE_ROOT`, default
`./.data/storage`, gitignored). This is the same deferral shape as
ADR-0006's BullMQ/Redis: the port is real and the local adapter is fully
tested with real filesystem I/O, but a cloud adapter (S3/GCS/MinIO) is
swapped in later without touching any use case, because nothing above
the port knows which adapter is behind it.

### Finding lookup for a scan

ADR-0009 already settled this: `Finding.scanId` (the TS type) is not a
stored column — it's `lastSeenScanId` when viewing current findings. A
scan's report is therefore "every `Finding` whose `lastSeenScanId`
equals this scan" — not a new decision, just the first place that
ADR-0009 clarification needs a real query. Added
`FindingRepository.listByScan(orgId, scanId): Promise<Finding[]>`,
unpaginated — mirrors `ReportRepository.listByScan`, already precedent
in this codebase for "a report/list operation needs the whole set, not
a page of it."

### Shared report model

`packages/reporting` gains a `buildReportModel(scan, repo, findings)`
function that all four generators consume, instead of each generator
re-deriving counts/health score independently and drifting apart.

**Health score formula** (invented here, not derived from an external
spec — documented so it can be revisited deliberately): start at 100,
subtract a per-open-finding penalty by severity (`critical: 25, high:
10, medium: 4, low: 1, info: 0`), floor at 0. Deliberately simple and
transparent over "scientifically accurate" — the target audience for
now is "does this number visibly drop when severity/volume gets worse,"
not an actuarial model.

### Format choices

- **JSON** — the `ReportModel` plus the full `Finding[]`, no surprises.
- **SARIF** — real SARIF v2.1.0 (`$schema`, `version`, one `run` with a
  `driver` and `results`). Severity maps to SARIF `level`: `critical`/
  `high` → `error`, `medium` → `warning`, `low`/`info` → `note`. This is
  the CI-consumable format (ADR-0016) — GitHub code scanning and other
  SARIF consumers parse this schema strictly, so it's implemented
  against the real spec, not a loose approximation.
- **HTML** — one self-contained file, inlined CSS, zero client-side JS.
  "Interactive" (per the original brief) is native `<details>`/
  `<summary>` disclosure widgets for per-finding detail — real
  interactivity without pulling a JS bundler into a framework-free
  package (ADR-0010 keeps `packages/reporting` dependent on `@cqp/core`
  only). Executive and developer "views" are sections of the same
  document (score tiles + category breakdown up top, full findings
  detail below) rather than two separate artifacts — one HTML file,
  anchor-linked.
- **PDF** — `pdfkit`. Pure JS, no native binary, no headless-browser
  dependency. After Phase 7's Windows binary-resolution pain
  (gitleaks/OSV-Scanner `.exe`, `spawn()` PATHEXT bug), a PDF generator
  that needs a Chromium binary (Puppeteer/Playwright) is a second
  instance of that exact problem for no real benefit at this stage —
  `pdfkit` renders directly in-process.

### Persistence + retrieval flow

`GenerateReportUseCase(orgId, scanId, format)`:

1. Load `Scan` (`GetScanUseCase`) and `Repo` (`GetRepoUseCase`) —
   reuses existing use cases rather than re-implementing lookups.
2. `FindingRepository.listByScan(orgId, scanId)`.
3. `buildReportModel(scan, repo, findings)` → the matching generator →
   `Buffer | string`.
4. `ObjectStorage.put(storageKey, content)` — key shape
   `reports/{orgId}/{scanId}/{format}.{ext}`.
5. `ReportRepository.create({ orgId, scanId, format, storageKey })`.

`GET /reports/:id/content` streams the raw bytes back via
`ObjectStorage.get(storageKey)` — separate from `GET /reports/:id`,
which returns the metadata row only (consistent with not conflating
"give me the record" and "give me the file" in one endpoint).

## Consequences

- `Report` has a `@@unique([scanId, format])` constraint already in the
  schema (Phase 4) — regenerating the same format for the same scan is
  an upsert, not a duplicate row. `GenerateReportUseCase` relies on this;
  the Prisma adapter's `create` uses `upsert`, not `create`, to honor it.
- The local filesystem storage adapter is not safe for multi-instance
  `apps/api` deployment (no shared disk) — acceptable for now per the
  same single-instance assumption ADR-0006 already made about the
  worker; revisit together when either goes multi-instance.
- No PDF/HTML visual regression testing — verified structurally (real
  `pdfkit` output has a valid PDF header and non-trivial byte length;
  real HTML output is parsed and asserted on data content), not
  pixel-diffed. Visual QA is a human/product concern, not something
  this test suite claims to cover.
