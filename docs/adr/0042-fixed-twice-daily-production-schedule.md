# ADR-0042: Production QA automation moves to a fixed twice-daily schedule

## Status

Accepted

## Context

Production QA automation (docs/adr/0035) ran on a user-adjustable
interval, with 3 of its 5 registered tests (`slot-booking-flow`,
`premium-upgrade`, `development-report-download`) gated to run
automatically at most once per calendar day via
`QaAutomationSchedule.lastDailyCheckAt`, since they open a real Razorpay
checkout session and the user didn't want that repeating on every
interval tick. In practice this meant most scheduled runs during a day
only executed the 2 `'every-run'` tests — surfacing to the user as "only
2 of 5 tests ran," which repeatedly looked like a bug even though it was
the intended design.

Per the user: run all 5 tests together, twice a day — once at 12:00 AM
IST and once at 12:00 PM IST — rather than a configurable interval with
per-test gating.

## Decision

**Fixed cron, matching staging's shape (docs/adr/0036).**
`upsertQaAutomationSchedule` now calls BullMQ's `upsertJobScheduler` with
`{ pattern: '0 0,12 * * *', tz: 'Asia/Kolkata' }` instead of `{ every: intervalHours * ... }`.
`QaAutomationSchedule` drops to `{ enabled: boolean }` — identical shape
to `QaAutomationStagingSchedule` — with a migration dropping the
`intervalHours` and `lastDailyCheckAt` columns from
`qa_automation_schedules`. The web UI's Production section drops its
interval input/Save button entirely, now just an Enable/Disable toggle
plus static schedule text, mirroring the Staging section exactly.

**`frequency` gating removed entirely, not just relaxed.** With a fixed
twice-daily schedule already accepted by the user as the cadence for the
payment-opening tests, there's no remaining reason to distinguish
`'every-run'` from `'daily'` — every scheduled tick (and every manual
"Run now") now runs the whole registered suite together, unconditionally.
`PortalAutomationTest.frequency` is deleted from the interface and all 5
test implementations; `RunQaAutomationSuiteUseCase.selectTests()` and its
`isSameCalendarDay` helper are deleted along with it — the use case no
longer takes a `QaAutomationScheduleRepository` at all, since it has
nothing left to gate on.

**Consequence accepted explicitly:** `slot-booking-flow`,
`premium-upgrade`, and `development-report-download` now open a real
(never-completed) Razorpay checkout session twice a day instead of once
— the same real-world cost as before, just doubled in frequency, which
the user asked for directly.

## Consequences

- `apps/qa-automation/src/main.ts` no longer constructs a
  `PrismaQaAutomationScheduleRepository` for the run use case — it's
  still used by `apps/api`'s schedule GET/PUT endpoints, just not by the
  worker's execution path anymore.
- A run triggered manually and a run triggered on schedule are now
  behaviorally identical in scope (both run everything) — the only
  remaining difference is `QaAutomationRun.triggeredBy`'s recorded value.
- If a future check needs different cadence again, the schedule itself
  (not a per-test flag) is the place to change — e.g. a third fixed time,
  or a dedicated separate schedule, following staging's precedent of a
  second schedule entity rather than reintroducing per-test frequency.
