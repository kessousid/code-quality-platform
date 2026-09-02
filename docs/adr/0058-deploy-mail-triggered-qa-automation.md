# ADR-0058: Trigger production QA automation from a deploy-notification email

## Status

Accepted

## Context

Production QA automation today only runs on a fixed twice-daily cron
(00:00/12:00 IST, docs/adr/0042) or a manual "Run now" click. The user
wants a run to also fire automatically whenever Curatal's own production
app deploys — but the deploy pipeline is GitLab CI/CD on AWS, entirely
outside this platform, and no webhook or API-token integration into it
was agreed.

What already exists: every successful production deploy sends a
notification email to a specific mailbox, containing a distinctive line
in its body. That email is the only signal this platform can act on
without a change to the deploy pipeline itself, so the chosen approach is
to poll that mailbox on an hourly cadence via Microsoft Graph and treat a
body-content match as the trigger.

The mailbox is a company Microsoft 365 account. Reading it requires its
own Entra ID app registration with Application (not Delegated)
permissions, admin consent, and — since this platform should only ever
read the one mailbox, not the whole tenant — an Exchange
`New-ApplicationAccessPolicy` scoping `Mail.Read` down to that mailbox.
This is a different OAuth flow from the existing OneDrive integration
(`packages/application/src/onedrive-graph-client.ts`), which uses a
**delegated** authorization-code flow because personal Microsoft accounts
require a signed-in user. This feature has no signed-in user at all: it
uses the **app-only client-credentials** flow (tenant-specific token
endpoint, `.default` scope, no refresh token, no per-org stored
connection — a fresh access token is fetched on every poll).

Five of six required Railway env vars were set on `qa-automation` before
implementation started: `DEPLOY_MAIL_TENANT_ID`, `DEPLOY_MAIL_CLIENT_ID`,
`DEPLOY_MAIL_CLIENT_SECRET`, `DEPLOY_MAIL_MAILBOX_ADDRESS`,
`DEPLOY_MAIL_BODY_MATCH`. The sixth, `DEPLOY_MAIL_ORG_ID`, must be added
alongside this deploy — Graph mailbox config here is a single set of
global env vars, not a per-org DB row, so this feature is inherently
single-org until there's a real second tenant; an explicit org id avoids
guessing "the first org in the DB."

## Decision

1. Widen `QaAutomationTrigger` (`packages/core`) to
   `'scheduled' | 'manual' | 'mail_triggered'`, with a matching
   `MAIL_TRIGGERED` value added to the `QaAutomationTrigger` Postgres enum
   — a mail-triggered run gets its own label rather than being reported
   as `'manual'`, so the dashboard/reports can tell a deploy-triggered run
   apart from a person clicking "Run now." (Underscore, not hyphen: the
   generic `.toUpperCase()`/`.toLowerCase()` conversion every other
   trigger value already goes through in `packages/db/src/mappers.ts`
   only round-trips correctly for a single-word-with-underscore value.)

2. New Graph client, `packages/application/src/deploy-mail-graph-client.ts`
   — plain `fetch`, no SDK, mirroring `onedrive-graph-client.ts`'s style
   but not its mechanism: `fetchDeployMailAccessToken` (client-credentials
   grant against the tenant-specific token endpoint) and
   `listRecentDeployMails` (`GET /v1.0/users/{mailbox}/messages`,
   `$filter=receivedDateTime ge {since}`, with the
   `Prefer: outlook.body-content-type="text"` header so Graph returns
   plain text and no HTML-stripping code is needed on this side).

3. New single-row-per-org watermark table, `DeployMailPollCursor`
   (`deploy_mail_poll_cursors`), tracking `lastPolledAt` — mirrors the
   existing `QaAutomationSchedule`/`OneDriveConnection` shape. A `null`
   cursor (never polled) falls back to a 2-hour lookback window on first
   poll.

4. New use case, `PollDeployMailAndTriggerQaAutomationUseCase`
   (`packages/application`): reads the cursor, fetches messages since
   then, checks for a case-insensitive body-content match against
   `DEPLOY_MAIL_BODY_MATCH`, and always advances the cursor regardless of
   whether a match was found. It returns `{ matched: boolean }` only — it
   does not import `@cqp/queue` or enqueue anything itself, keeping the
   same `packages/application` → adapter layering every other use case in
   this package already follows. The actual enqueue happens in the outer
   `apps/qa-automation` layer.

5. New queue export, `enqueueMailTriggeredQaAutomationRun`
   (`packages/queue/src/qa-automation-queue.ts`) — a one-off job added to
   the _existing_ `qa-automation` queue with `triggeredBy: 'mail_triggered'`.
   No new worker is needed to actually run the suite, only a new producer
   call.

6. New lightweight queue + hourly scheduler,
   `packages/queue/src/deploy-mail-poll-queue.ts`, mirroring
   `qa-automation-queue.ts`'s `upsertJobScheduler`/fixed-scheduler-id
   shape (`'0 * * * *'`, `Asia/Kolkata`, matching every other schedule in
   this codebase).

7. Wiring in `apps/qa-automation/src/main.ts` follows the exact
   optional-feature gate already used for OneDrive
   (`if (oneDriveClientId && oneDriveClientSecret)`): all six
   `DEPLOY_MAIL_*` env vars must be present together or the feature is
   skipped entirely and logged as disabled — never a hard `requireEnv()`
   throw, since any environment without it configured must still boot
   normally. No dashboard toggle/API endpoint in this first pass.

## Consequences

- Mailbox-poll granularity means up to a ~1 hour delay between an actual
  deploy and the QA run starting — this is not a real-time trigger.
- A `'mail_triggered'` run reuses the exact same production suite as
  `'manual'`/`'scheduled'` — no test-selection differences based on
  trigger.
- Single-org/single-mailbox by design (env-var-driven, not a per-org DB
  setting) until there's a real second tenant that needs its own mailbox.
- A broken mail trigger (bad credentials, revoked consent, mailbox
  renamed) surfaces only via the poll worker's own `.on('failed', ...)`
  log line — unlike OneDrive's best-effort swallow-all-errors uploader, a
  silently-broken trigger here would just look like "deploys stopped
  happening," which is worse than a visible failed job, so Graph errors
  are left to propagate rather than being caught and ignored.
- If `DEPLOY_MAIL_ORG_ID` is ever wrong or stale (e.g. after an org is
  deleted/recreated), the poller keeps running against a nonexistent org
  and every job fails — there is no validation against `Org` at startup
  beyond the foreign key on `deploy_mail_poll_cursors.orgId`.
