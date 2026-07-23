# ADR-0023: Scan cancellation, live progress, category selection, and a target folder picker

## Status

Accepted

## Context

The first real end-to-end scan against a live checkout (see ADR-0021,
ADR-0022) surfaced four usability gaps at once, discovered by actually
using the running app rather than by writing more unit tests:

1. A repo's `localPath` was typed in by hand, with no way to browse the
   worker's filesystem from the browser — a `C:\CuratalIT` root
   containing ~25 unrelated projects got scanned by mistake, because
   nothing stopped it from pointing at a directory that isn't a single
   repo.
2. Once a scan is `running`, there is no way to stop it. A wrong target
   (like the ~25-project case above) or a scan the user simply no longer
   wants had no way to be aborted short of restarting the whole worker
   process.
3. `running` gave zero visibility into progress — no indication of which
   analyzer is executing, how many are left, or whether the process is
   actually doing anything.
4. Every scan always ran all 6 plugins. There was no way to run "just
   security" or "just code quality" — relevant now that plugin count and
   per-category runtime (Semgrep alone takes ~20s) both keep growing.

## Decision

### Cancellation is real, not cosmetic

A scan can be cancelled from either state:

- **`queued`**: `CancelScanUseCase` removes the not-yet-started BullMQ job
  via a new `ScanQueue.cancel(scanId)` and sets `status: 'cancelled'`.
  `enqueue()` now passes `jobId: scanId` so `cancel()` can look the job up
  directly, with no separate id-mapping table.
- **`running`**: the cancel request lands in the API process; the scan is
  executing in the worker process. There is no shared in-memory state
  between them, so `RunScanUseCase.execute()` polls the DB for its own
  scan's status every second while running. On seeing `cancelled`, it
  calls `AbortController.abort()`, whose `signal` was threaded all the way
  down into `runIsolated` (`packages/plugin-runtime`) — the abort handler
  there calls the same `worker.terminate()` used by the existing timeout
  path. This actually kills the in-flight `worker_thread` (and whatever
  child process it spawned, e.g. Semgrep), not just stop waiting on it.
  Verified live: cancelling a scan mid-flight (4/6 plugins done) reached
  6/6 "completed" (aborted) within ~2 seconds, not left hanging.
- `RunScanUseCase.execute()` also guards its own entry: if the scan is
  already `cancelled` when a (barely-)started job runs, it returns
  immediately without transitioning to `running` — covers the race where
  BullMQ handed a job to the worker in the same instant it was being
  cancelled from the queue.
- A cancelled scan's partial findings are **not** persisted — persisting a
  half-finished result set would be a worse UX than no result at all for
  a run the user explicitly asked to stop.

### Live progress reuses the same status row

`packages/scan-engine`'s `runScan` gained an `onProgress` callback,
emitting `{type:'total'}` once (after glob-filtering, so the count is
real — not the full plugin list) and `{type:'plugin-start'}` /
`{type:'plugin-finish'}` per plugin. `RunScanUseCase` wires this to a new
`ScanRepository.updateProgress()` port method, writing three new nullable
columns on `Scan`: `pluginsTotal`, `pluginsCompleted`, `currentPluginId`.

No new endpoint was needed — `GET /scans/:id` already returns the full
`Scan` row, so the frontend's existing `useScan` hook just gained a
`refetchInterval` that polls every 2s while `status` is `queued`/`running`
and stops polling once terminal. A progress bar and a "Cancel scan" button
render from that same polled data (`ScanProgress`, `ScanStatusHeader`
components). Six plugins finishing in tens of seconds doesn't justify a
websocket/SSE channel — 2s polling is simple and sufficient.

### Category selection reuses the existing `AnalysisCategory` model

Every plugin already declared its `categories: AnalysisCategory[]` on its
`PluginDescriptor` (`packages/scan-engine/src/plugin-registry.ts`) since
Phase 8 — nothing new was needed at the plugin level. `Scan` gained a
`categories AnalysisCategory[]` column (empty = every applicable plugin,
preserving today's default behavior with no migration-time backfill
needed). `RunScanUseCase` filters `builtinPlugins` by the scan's
categories before calling `runScan`. The API/frontend expose only the 5
categories a real plugin actually produces (`security`, `code-quality`,
`secret-detection`, `dependency-vulnerability`, `architecture`) — the
other 7 values in the 12-value `AnalysisCategory` union have no plugin
yet and would silently select nothing.

### The target-folder picker browses the machine the worker runs on

A new `GET /fs/browse?path=` endpoint (`apps/api/src/fs`) lists real
subdirectories of a given path via `node:fs/promises`, defaulting to the
user's home directory. This works today specifically because the current
deployment model has the browser, API, and worker all on the same
machine (ADR-0003's deferred live-VCS-integration + ADR-0021's
local-checkout requirement) — "browse the server's filesystem" and
"browse the user's own machine" are the same operation here. It sits
behind the same global `ApiTokenGuard` as every other route; no new
privilege boundary is introduced, and the interim no-verification caveat
from ADR-0022 already covers this route like every other one. This will
need revisiting if/when the worker ever runs on a different machine from
the browser (out of scope until ADR-0003's deferred live-VCS work lands).

## Consequences

- `ScanStatus` gains `'cancelled'` (core union + Prisma enum,
  `20260720000000_add_scan_progress_and_categories` migration). Every
  switch/exhaustiveness check over `ScanStatus` elsewhere in the codebase
  needed auditing — `scanStatusToDb`/`scanStatusFromDb`'s generic
  uppercase/lowercase mapping needed no change, but `updateStatus`'s
  `completedAt`-stamping condition did.
- `RunScanUseCase.execute()` grew a DB-polling `setInterval` for its own
  lifetime — a small, deliberate bit of state (cleared in a `finally`)
  rather than pulling in a pub/sub layer for a problem six plugins over a
  few minutes doesn't need.
- Progress writes are fire-and-forget and best-effort
  (`.catch(() => {})`) — a transient DB hiccup on a progress update must
  never fail the scan itself. The local `completedCount` closure variable
  avoids a read-then-write race between concurrently-finishing plugins
  (JS's single-threaded event loop means the callback itself never runs
  concurrently with itself, even though the plugins it's reporting on do).
