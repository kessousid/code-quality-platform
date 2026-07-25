# ADR-0033: Cron Runner — trigger external COD crons from a page

## Status

Accepted

## Context

A completely separate, unrelated external system (a recruiting platform,
"COD") has known cron jobs, sourced from Postman exports (a July 2026
re-export for Dev added a fourth, `cod-interviewed-candidate`, on top of
the original three). Today the only way to run one on-demand is manually
via Postman, per developer, with no shared history of who ran what, when,
or against which environment.

## Decision

**A new page lets a user pick a cron by name and an environment (Dev or
Staging — Prod deliberately excluded, see below), click Run, and see the
result**, with a persisted history of past runs.

**Cron definitions are hardcoded in `@cqp/core` (`CRON_DEFINITIONS`,
`CRON_ENVIRONMENT_BASE_URLS`), not DB-managed.** They come from Postman
exports and change rarely; there's no admin-UI need yet. Adding a cron or
a new environment is a code change, not a migration. One entry from the
July 2026 re-export (`COD/assignedcandidate`) was a true duplicate of
`candidate-scoring-assign` — same method, host, and path — and was left
out deliberately, not missed.

**Execution is synchronous/blocking, not queued.** The sample Postman
response for "Get COD Candidates" shows the external endpoint itself runs
synchronously and returns a complete JSON result when done. So `POST
/cron-runs` simply awaits the real outbound call — the browser's own
request-pending state (spinner + elapsed-seconds counter) during that
call _is_ the "live status," with no BullMQ job/worker/polling needed for
this, unlike every other long-running operation in this codebase.
**Stated limitation, up front**: a very slow external cron could hit an
HTTP/gateway timeout with no automatic retry or resume. Acceptable for
now given the known crons are fast in the sample data; revisit with a
queued/async design (mirroring docs/adr/0021's scan orchestration) if
that becomes a real problem.

**`CronRun` has no foreign key to a "cron" row** — definitions are code,
not data, so nothing to FK to. It stores a denormalized `cronId`/
`cronName` snapshot at trigger time, org-scoped only (not repo-scoped —
these aren't tied to any registered repo at all).

**No auth headers are sent.** Confirmed directly with the user that these
specific external endpoints currently require none — `HttpCronExecutor`
sends a bare `POST` with no headers/body, matching the Postman collection
exactly. Revisit the moment the external system adds auth.

**Prod is deliberately out of scope for now** — only `dev`/`staging`
exist in `CronEnvironment` and DTO validation. Adding Prod later is a
one-line change to `CRON_ENVIRONMENT_BASE_URLS` plus the validation list,
deferred until there's an actual need to run these against production
candidate data from this tool.

## Consequences

- This is the first backend use of an outbound HTTP call anywhere in this
  codebase (`packages/cron-client`'s `HttpCronExecutor`, using Node's
  built-in global `fetch` — no new dependency).
- `CronRun.triggeredByUserId` is optional and left unpopulated today —
  no `@CurrentUser()` decorator exists anywhere in `apps/api`, the same
  gap already present on `Scan.triggeredByUserId`.
- Only the read/report-style "Get COD Candidates" cron is safe to smoke
  test automatically; `candidate-outreach`, `candidate-scoring-assign`,
  and `cod-interviewed-candidate` have real side effects on live
  candidate data and are only ever triggered deliberately, by a person,
  from the UI.
