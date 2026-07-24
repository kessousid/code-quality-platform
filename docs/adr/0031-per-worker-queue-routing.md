# ADR-0031: Per-worker queue routing

## Status

Accepted

## Context

Deploying the API/worker/web split to Railway (ADR-0030) made a
previously-theoretical gap concrete: a repo's `localPath` only means
anything on the machine actually running the **worker**, since that's
the only process that reads files off disk. With the API and web hosted
centrally on Railway and a developer wanting to keep testing their own
uncommitted local code, the worker has to run on _their_ machine — but
before this change, the whole platform assumed exactly one worker
process, consuming three fixed, globally-shared queue names (`scans`,
`unit-tests`, `coverage-runs`). Running a second worker instance (a
different developer's laptop) against the same Redis meant BullMQ would
hand either worker any job on those queues indiscriminately — a job for
repo A's files could land on developer B's machine, which can't see
them, and fail for reasons that look like a platform bug rather than
what they actually are: wrong worker, wrong disk.

A second, related gap surfaced while testing this for real:
`CreateCoverageRunUseCase` validated `baseRef` upfront by shelling out to
`git rev-parse` on **the API's own filesystem** (docs/adr/0025's decision 3) — sound when the API and worker were guaranteed to be the same
machine, but wrong once they can be different machines. Creating a
coverage run against a repo whose `localPath` lives on a remote
developer's laptop always failed with a misleading "Base ref does not
resolve," even for a perfectly valid ref, because the API process
was checking a path that simply doesn't exist on its own disk.

## Decision

**`Repo` gets a `workerId` field** (`string`, default `'default'`) —
which worker instance's filesystem `localPath` actually lives on. Set
explicitly per repo at creation time (a plain text field in the UI and
API, not auto-detected — there's no way for the API to know which
machine a path string refers to).

**Every BullMQ queue is namespaced by `workerId`**: `scans:<workerId>`,
`unit-tests:<workerId>`, `coverage-runs:<workerId>`, replacing the fixed
`scans`/`unit-tests`/`coverage-runs` names. `@cqp/queue` gained a
`BullMq*QueueRegistry` per job type — lazily creates and caches one real
BullMQ `Queue` per `workerId` over a shared Redis connection — replacing
the single eager `BullMq*Queue` singleton each `apps/api` module used to
register. The three `Create*UseCase`s already fetch the `Repo` before
enqueueing, so `repo.workerId` is available right where it's needed;
`registry.forWorker(repo.workerId).enqueue(...)` replaces a plain
`queue.enqueue(...)`.

**`apps/worker` reads a `WORKER_ID` env var** (default `'default'`) and
only ever consumes the three queues namespaced to its own id. A repo
tagged with a `workerId` that has no worker currently running for it
just accumulates queued jobs harmlessly — never processed by the wrong
machine, never crashing, just waiting.

**Cancel had to change too, in a way Create didn't need to worry
about**: `Cancel*UseCase` only ever had the run/scan id, not the repo —
routing a cancel to the right queue means fetching the repo (via the
run's `repoId`) to recover `workerId` first. All three cancel use cases
gained a `RepoRepository` constructor dependency for exactly this. A
repo that's since been deleted just skips the queue-cancel step (nothing
to route to) and still marks the run cancelled in the DB — the same
practical outcome as before this feature existed.

**`CreateCoverageRunUseCase` no longer validates `baseRef`** at all —
`verifyRefExists` and `BaseRefNotFoundError` are gone from this use case
entirely. There's no way to answer "does this ref resolve" from the API
process once the repo's worker might be a different machine. The
question is answered instead where it's actually knowable: inside
`RunCoverageGateUseCase`, on the worker that owns the repo, which
already wraps the whole coverage-gate run in a try/catch that persists
any thrown error (including a real `git` failure) as the run's
`errorMessage` — no new code needed there, just one new test proving it.

## Consequences

- Every existing repo record defaults to `workerId: 'default'` via the
  migration, and the existing single-machine setup (one worker, `WORKER_ID`
  unset) is unaffected — `scans:default` etc. is just what the fixed
  `scans` queue effectively already was.
- A coverage-gate "Base ref does not resolve" error now surfaces after
  the run is created (status `failed`, with the real git error as
  `errorMessage`) instead of blocking creation outright with a 400 — a
  real, accepted behavior change: a typo'd branch name is now visible as
  a failed run in the history rather than an immediate rejection.
- This does not make routing _secure_ — a repo's `workerId` is a plain,
  user-supplied string with no authentication tying it to a specific
  machine. It prevents accidental cross-machine job routing in a
  cooperating team, not a hostile one.
