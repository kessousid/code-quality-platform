# ADR-0050: Per-service Railway Watch Paths, managed as code

## Status

Accepted

## Context

A real staging QA automation run (started 05:10 UTC, ~24 minutes in)
was killed mid-execution when an unrelated `docs/user-guide.md`-only
commit was pushed to `main`. Railway rebuilt and restarted **all four**
services — `api`, `worker`, `web`, and `qa-automation` — even though
that commit touched no code any of them execute. The orphan-
reconciliation safety net (ADR-0043) correctly caught the resulting
stuck-`'running'` row and marked it failed, and the alert email fired as
designed — but the run itself still had to be re-started from scratch.

Checked each service's actual composition-root imports (not just its
`package.json` — `@cqp/application` alone transitively pulls in nearly
every engine package) to find what each service _genuinely executes_:

- `apps/api` never constructs `RunScanUseCase`/`RunUnitTestGenerationUseCase`/
  `RunCoverageGateUseCase` — those live entirely in `apps/worker`. So
  `api`'s real footprint is exactly its own direct dependencies, nothing
  transitively pulled in through `@cqp/application`'s other use cases.
- `apps/qa-automation` doesn't depend on `@cqp/git-checkout`,
  `@cqp/gemini-test-generator`, or `@cqp/script-test-generator` at all —
  confirmed by the fact it has no `checkoutProvider` to satisfy those
  three use cases' constructors even if it wanted to call them. It does,
  however, genuinely use `@cqp/reporting` (the Excel attachment on its
  own alert emails).
- `apps/worker` is the only service that actually executes the scan/
  unit-test/coverage engines and every plugin — its real footprint is by
  far the broadest of the four.
- `apps/web` is a pure SPA calling the API over HTTP — its real
  footprint is just its own code plus the two packages whose _types_ it
  imports (`@cqp/core`, `@cqp/reporting`).

Narrowing a watch path only controls whether Railway _attempts_ a
rebuild for a given push — it can never cause a stale deploy, since
whenever a rebuild does happen (for any reason), it always builds from
the full current source tree. Under-scoping is strictly safe; it only
means an irrelevant change won't trigger an unneeded restart.

## Decision

Set each service's Watch Paths to its real, verified execution
footprint (see `.railway/railway.ts`), plus `pnpm-lock.yaml` for all
four (a dependency bump affects every service's install step
regardless of which packages changed). None of the four include
`docs/**` or root-level `*.md` — exactly the class of change that
caused this incident.

**Managed as code, not just clicked into the dashboard.** Railway
supports a config-as-code workflow (`railway config pull` / `plan` /
`apply` against `.railway/railway.ts`, via the `railway` npm package's
`railway-iac-ts` binary) — pulled the live project, added `build.watchPatterns`
to each service, verified with `railway config plan` that the diff was
_exactly_ the four watch-path additions and nothing else, then applied.

**Real near-miss during this process, worth recording**: the first
`railway config pull` was run with `--omit-preserved-variables` (to
keep the generated file smaller). That flag doesn't just shrink the
file — it _omits_ variables from the config entirely, and `railway
config apply`'s reconciliation treats an omitted variable as "delete
it." The resulting plan showed **all 52 environment variables across
all four services** — `DATABASE_URL`, `REDIS_URL`,
`REPO_TOKEN_ENCRYPTION_KEY`, every staging-suite credential — queued for
deletion, which would have broken every service instantly. Caught by
`railway config plan`'s dry-run before anything was applied. **Never
pull with `--omit-preserved-variables` if the result will ever be
applied** — the plain `railway config pull` (variables rendered as
`preserve()`, i.e. "leave exactly as-is") is the only safe form for a
real apply.

## Consequences

- Editing Watch Paths (or any other per-service Railway setting covered
  by this tool) going forward should go through `.railway/railway.ts` +
  `plan` + `apply`, not the dashboard — `plan`'s dry-run diff is what
  caught the near-miss above, and the dashboard has no equivalent
  preview step.
- Applying a Railway config change is itself a deploy trigger for any
  service whose config actually changed (confirmed live: `api`,
  `worker`, and `qa-automation` all rebuilt once when this was applied,
  `web`'s did not need to). Anyone using this workflow again should
  confirm no long-running job is in flight on an affected service first
  — the exact risk this ADR exists to reduce for _future_ pushes doesn't
  disappear for the one push that sets it up.
- If a genuinely new package gets added to a service's real dependency
  graph later, its watch path needs a manual update — this isn't
  derived automatically from the pnpm workspace graph, so it can drift
  from reality over time if not revisited when dependencies change.
