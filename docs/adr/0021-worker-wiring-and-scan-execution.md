# ADR-0021: Worker wiring — real scan execution, local-checkout requirement, fingerprint upsert

## Status

Accepted

## Context

Every phase from 5 through 10 deliberately deferred this: ADR-0006 built
BullMQ/Redis wiring as a compiling skeleton with no real connection open;
ADR-0018 built the scan orchestrator but explicitly left "wiring it into
`apps/worker`'s BullMQ consumer and persisting via `PrismaFindingRepository`"
as a named follow-up; ADR-0009 flagged the fingerprint-based upsert
("Phase 7's job") without anyone actually implementing it. The result: a
user can create a repo and click "start scan," and nothing happens — the
`Scan` row sits at `status: queued` forever. This closes that gap.

## Decision

### Where does the code actually live to scan?

`packages/scan-engine`'s plugins operate on a real directory on disk
(`ScanTarget.repoRoot`) — there has never been a mechanism to fetch a
repo's contents from anywhere. ADR-0003 explicitly deferred live VCS App
integration (cloning via GitHub/GitLab OAuth), so building that now would
be scope creep on top of an already-large piece of wiring.

**`Repo` gets a new nullable `localPath` column.** A scan only actually
runs if `repo.provider === 'local'` and `repo.localPath` is set — the
user points the platform at a directory already checked out on the
machine running the worker. `github`/`gitlab` repos remain
metadata-only until real cloning is built (a new ADR's job, not a
retrofit here). Attempting to scan a repo without a usable local path
fails the scan clearly (`status: failed`), not silently.

### Job payload stays minimal (ADR-0006's own constraint)

The queue (`'scans'`) carries `{ scanId: string }` only. The worker loads
everything else — `Scan`, `Repo`, prior `Finding` rows — from Postgres.
Redis is not a second source of truth for scan data, exactly as ADR-0006
already required.

### `RunScanUseCase` owns the orchestration, in `packages/application`

Not in `apps/worker` — the same Clean Architecture rule as every other
phase (ADR-0010). `apps/worker`'s job is a thin BullMQ `Worker` that loads
Prisma-backed repositories and calls one use case. This keeps "what
happens when a scan runs" testable with in-memory doubles, no Redis or
Postgres required to prove the logic itself is correct — the same
tradeoff this project has made everywhere else.

Sequence:

1. `updateStatus(scanId, 'running')`.
2. Resolve `ScanTarget` — `{ repoRoot: repo.localPath }` for a full scan;
   for incremental, add `changedFiles` from `computeChangedFiles`
   (real `git diff`, already built in Phase 7) between the base scan's
   `ref` and this scan's `ref`, in that same local checkout.
3. `runScan(builtinPlugins, ...)` — the real Phase 7 engine, unchanged.
4. For each raw finding: compute its fingerprint (`packages/correlation`,
   unchanged since Phase 5) and `FindingRepository.upsertFromScan(...)`.
5. `updateStatus(scanId, 'completed')` — or `'failed'` if any step above
   throws, with the error rethrown after the status update so it's still
   visible in worker logs/BullMQ's failed-job list.

### Fingerprint upsert semantics (closes ADR-0009's flagged gap)

`FindingRepository.upsertFromScan` keys on the schema's existing
`@@unique([repoId, fingerprint])` constraint (Phase 4 already anticipated
this; nothing new there):

- **Match found** — update the mutable fields (title/severity/confidence/
  locations/references may have shifted slightly between scans even for
  "the same" issue), set `lastSeenScanId` to the current scan, and
  **reopen it** (`status: OPEN`) if it had been marked `fixed` — a
  finding that disappeared and came back is not history, it's live
  again. `firstSeenScanId` never changes once set.
- **No match** — insert a new `Finding` with `firstSeenScanId ===
lastSeenScanId === currentScanId`, `status: OPEN`.
- **Either branch** writes a `FindingHistory` row for `(findingId,
scanId)` (upsert on that pair's existing unique constraint, so a
  retried job is idempotent) — this is what the trend chart and
  "was this fixed then reopened" queries read (ADR-0009).

A finding that a _previous_ scan found but this scan's plugins no longer
detect is **not** touched by this pass — the platform never knows a
finding is gone unless something says so. Marking findings `fixed` when
they simply weren't re-detected is a real feature (closes the loop this
data model was built for) but a separate, deliberate piece of logic, not
an accidental side effect of this ADR's upsert loop. Deferred, not
forgotten.

### Partial plugin failure

`ScanEngineResult.pluginStatuses` (already returned by Phase 7's
orchestrator) is logged, not persisted — there's no schema column for
"which plugins succeeded on this scan" yet. A scan still completes if
some plugins time out or error (ADR-0018's own rule); the gap is
_visibility_ after the fact, not correctness of what's stored. Revisit
if that visibility gap actually matters in practice — not worth a schema
change speculatively.

## What did not change

- The dependency graph itself (`Scan.dependencyGraphStorageKey`) is still
  unpopulated — the dependency-graph plugin only ever emitted a
  `circular-dependency` _Finding_, never the raw graph structure as a
  storable artifact. Out of scope here; unrelated to this ADR's job.
- No cloning, no GitHub/GitLab auth, no remote checkout — ADR-0003 stands.

## Consequences

- **This closes the loop end-to-end for a local repo**: create a repo
  with a real `localPath`, start a scan, and real `Finding` rows appear,
  correctly deduped across repeated scans — the dashboard and Phase 9's
  reports now have real data to show without a seeding script.
- `RunScanUseCase`'s branching (status transitions, upsert-vs-insert,
  reopen-on-reappear, incremental target resolution) is fully covered
  with in-memory doubles — no Postgres/Redis needed to trust the logic.
  The Prisma adapter methods it depends on (`upsertFromScan`,
  `updateStatus`, `localPath` read/write) follow the same patterns
  already proven correct elsewhere in `packages/db`, but — like every
  Prisma adapter before the session that had live-DB access — are
  compiled/typechecked, not live-exercised, in this pass. Live
  verification is the same kind of gap this project has closed
  before (see `docs/architecture/dev-database.md`) and can be closed
  the same way again if wanted.
- Single-instance assumption again (same as ADR-0006/ADR-0019): one
  worker process, one local filesystem holding every scanned repo's
  checkout. Fine for the sandbox/dev target this is built for; revisit
  together with those other single-instance decisions if this ever runs
  multi-instance.
