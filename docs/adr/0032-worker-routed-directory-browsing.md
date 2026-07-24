# ADR-0032: Route the folder picker through a specific worker

## Status

Accepted

## Context

`GET /fs/browse` always read the **API process's own filesystem**
(`node:fs`'s `readdir`) — a reasonable assumption when ADR-0003's
single-machine deployment model held (API and worker always the same
box). Once the API is hosted centrally (ADR-0030, Railway) and a
developer runs their own worker locally (ADR-0031), that assumption
broke concretely: the "Browse…" button on both the Add-repo form and the
unit-test target picker started listing directories inside Railway's own
container (`/root`, etc.) — completely unrelated to anything on the
developer's actual laptop. The feature wasn't just wrong, it was
_silently_ wrong: it returned a real, valid-looking listing, just of the
wrong machine.

## Decision

**A folder picker request now routes to a specific worker over BullMQ**,
mirroring the per-`workerId` queue registries from ADR-0031, but with a
shape none of those needed: a real **request/response** round trip, not
fire-and-forget. `?workerId=` on `GET /fs/browse` selects which worker's
disk to read; omitting it keeps the original direct-read behavior
unchanged (for any caller that doesn't care about routing — e.g. a
genuinely single-machine setup).

**`DirectoryBrowseQueue.browse()` waits for the real answer** using
BullMQ's own `QueueEvents` + `Job#waitUntilFinished` — the first use of
`QueueEvents` in this codebase, since every other queue here only ever
needed "job enqueued," never "job's result." The worker's browse-job
processor runs the exact same `browseDirectory()` function the API's own
legacy direct-read path calls, both now living in a new
`@cqp/filesystem-browser` package so the two paths can't drift into two
different directory-listing behaviors. A 10-second timeout maps a
non-responding worker (not running, wrong `workerId`, network partition)
to a clear message — a folder picker is interactive; hanging is worse
than failing fast.

**Wiring**: `apps/web`'s `DirectoryBrowser` takes a `workerId` prop,
threaded from wherever it's rendered — the Add-repo form already had a
`workerId` field in local state (ADR-0031's form), and
`GenerateUnitTestsSection` gets it as a new prop from `RepoDetailPage`,
which already fetches the full `Repo` (and so its `workerId`) via
`useRepo`.

### Tradeoff, stated up front

This makes every routed browse request as slow as a Redis round trip
plus however long the target worker takes to notice the job — not
instant the way a direct `readdir()` was. Acceptable for an occasionally
-used folder picker; would not be for something called on every
keystroke.

## Consequences

- `apps/api/src/fs/fs.controller.ts` gained a real constructor dependency
  (`DirectoryBrowseQueueRegistry`) — every direct `new FsController()` in
  tests needed a registry passed in; `packages/application/src/testing`
  gained `InMemoryDirectoryBrowseQueueRegistry`, which (unlike the other
  in-memory queues) actually calls the real `browseDirectory()` rather
  than returning a canned result, since faking the one thing this port
  exists to do would test nothing.
- The genuinely new mechanism here — `QueueEvents`-based request/response
  over BullMQ — has no local Redis available to exercise as an automated
  test in this environment; it was verified against a real, live
  deployment instead (a real worker on a developer's machine answering a
  real browse request from the Railway-hosted API), the same way
  ADR-0031's routing itself was verified. The queue-naming/registry
  mechanics that _can_ be tested without live Redis (synchronous BullMQ
  name validation, per-workerId isolation) are covered the same way as
  the other three queues.
