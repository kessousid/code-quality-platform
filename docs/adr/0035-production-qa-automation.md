# ADR-0035: Scheduled production QA automation against portal.curatal.com

## Status

Accepted

## Context

The candidate portal at `https://portal.curatal.com/` (production, no
staging equivalent) has a slot-booking business rule that has never been
covered by an automated check: on the "Book Interview Slot" screen,
Sunday must show zero Free Slots (everything paid/"Priority Flexible"),
and every other day must show Free Slots strictly between 9 AM–7 PM with
Priority (paid) slots at-or-before 9 AM and at-or-after 7 PM. The user
wants this verified periodically (interval adjustable without a
redeploy), wants to add more such checks over time, and wants an email
alert on failure — all against the real live site with a real dedicated
candidate login, never completing a real payment or leaving behind a
real booked interview.

Live exploration against production (see the conversation history, not
reproduced here) confirmed: the login flow, an undocumented "Candidate
Verification Details" modal that must be dismissed via its own Cancel
button, the calendar/two-panel slot layout, real Sunday-vs-weekday slot
data matching the stated rule, and — critically — that the Priority
"Pay & Schedule" flow leads to a genuine third-party Razorpay checkout
rendered inside a real cross-origin `<iframe>`, only detectable via
`page.frameLocator(...)`, not top-level `page` locators.

## Decision

**A new package, `packages/qa-automation-tests`, holds an extensible
registry of Playwright-driven checks**, not `packages/core` — a real
check needs a real Playwright `Page`, and core stays framework-free
(ADR-0010). `PortalAutomationTest { id, name, frequency, run(page) }`
plus a `createPortalAutomationTests(credentials)` factory is the whole
extension point: adding a check later is a new file + one array entry,
no DB/UI change needed.

**Two checks ship initially.** `SlotListingPricingTest`
(`frequency: 'every-run'`) — cheap, read-only, checks the Sunday/weekday
pricing rule directly against real slot data. `SlotBookingFlowTest`
(`frequency: 'daily'`) — walks the real Priority payment flow through to
the Razorpay iframe (asserting `Payment Options`/`Price Summary` appear,
then closing the browser without paying) and confirms a Free Slots time
reveals a `Schedule Interview` button without ever clicking it. Per the
user: reaching the payment screen / seeing the schedule button **is**
the pass signal — visibility only, never completing either action.

**`frequency` is the resolved answer to a real business-risk tradeoff.**
Opening a real Razorpay checkout on every scheduled tick would generate
a real abandoned-checkout session each time. `'every-run'` tests run on
every scheduled tick; `'daily'` tests run automatically at most once per
calendar day, tracked via `QaAutomationSchedule.lastDailyCheckAt`
(`RunQaAutomationSuiteUseCase` checks/stamps it, not each test). A
manual "Run now" trigger always runs every test regardless — a
deliberate, occasional action. This is generic, not a one-off special
case: any future cost-bearing check can also be marked `'daily'`.

**Run/result model mirrors `Scan`/`Finding`, not the Cron Runner's
single-shot shape** — one scheduled tick runs the _whole_ registered
suite. `QaAutomationRun` (id, orgId, status, triggeredBy, startedAt,
completedAt) is the parent; `QaAutomationTestResult` (runId, testId,
testName, passed, details) is the per-test child.

**Scheduling is a BullMQ repeatable job with a DB-stored, API-adjustable
interval** — the first use of BullMQ's `upsertJobScheduler`/
`removeJobScheduler` in this codebase (every prior queue use here was
either fire-and-forget one-shot jobs or the Cron Runner's synchronous
HTTP call). A single-row-per-org `QaAutomationSchedule` (intervalHours,
enabled) is the source of truth; `PUT /qa-automation/schedule` in
`apps/api` calls `upsertQaAutomationSchedule` (or `removeQaAutomationSchedule`
if disabled) directly against the real BullMQ `Queue` — this raw
BullMQ-specific orchestration lives in the Nest module/controller layer,
not behind a `packages/core` port, since `upsertJobScheduler` is a
BullMQ-specific concept, not a generic "enqueue a job" one.
`apps/qa-automation` is a pure consumer, oblivious to whether a job came
from the repeater or a manual trigger.

**A new Railway service, `apps/qa-automation`**, Dockerized like
`apps/worker` but with `mcr.microsoft.com/playwright:v1.48.0-jammy` as
the _runtime_-stage base image instead of `node:20-slim` — Chromium and
every OS-level dependency it needs ship preinstalled, so no manual
browser-dependency wrangling in the Dockerfile. The pinned tag's
Chromium build must track whatever `playwright` npm version this repo
installs.

**Email alerting is genuinely new to this codebase.** An `EmailSender`
port (`packages/core`) plus a `NodemailerEmailSender` adapter
(`packages/email`, Gmail SMTP with an app password) sends one alert if
any test in a run failed, naming which ones and their `details`. Stated
gap: unlike this repo's other real-I/O adapters (e.g. `HttpCronExecutor`
tested against a real local HTTP server), there's no lightweight local
SMTP double — the compose/decide-to-send logic is unit-tested with an
in-memory `EmailSender` fake; the real SMTP send is live-verified once,
not covered by the automated suite.

**Credentials are Railway env vars** (`PORTAL_QA_EMAIL`,
`PORTAL_QA_PASSWORD`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_APP_PASSWORD`,
`ALERT_EMAIL_TO`), never committed — mirrors existing secret handling for
other services.

**A new 4th Feature Selector option, "Production QA Automation"** — a
page with an editable interval, a "Run now" button, and run history
(pass/fail per run, expandable to per-test results with `details`).

## Consequences

- This is the first use of Playwright, and the first real outbound
  browser-automation session, anywhere in this codebase.
- `RunQaAutomationSuiteUseCase` takes an injected `QaBrowserFactory`
  (`() => Promise<QaBrowser>`), kept structural rather than importing
  `playwright`'s own types, so `packages/application`'s own tests inject
  a fake browser/pages instead of a real one — it never actually opens a
  browser.
- Every scheduled tick still opens a real Chromium session against
  production and logs in with a real candidate account — an accepted,
  real operational cost of testing against production with no staging
  equivalent, not something staged or mocked away.
- `SlotBookingFlowTest` genuinely opens (and abandons) a real Razorpay
  checkout session against production once per day, plus on every manual
  "Run now" — an accepted, real cost, not a hypothetical one, mitigated
  only by frequency, not eliminated.
- The sidebar's "expand" control has no discoverable accessible name
  (icon-only, no `aria-label` found during live exploration), so
  `loginAndReachBookingScreen` clicks it by fixed coordinates — a known
  fragility point if the site's layout changes, flagged in code.
