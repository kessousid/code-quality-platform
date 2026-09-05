# ADR-0065: Split `batch1b` into three per-directory sub-batches

## Status

Accepted

## Context

The user asked why the 2026-09-04 full staging run had a wave of
failures — many in `scheduling_admin` and `mentor` — that then mostly
passed when just the failed tests were rerun in isolation: 460 passed /
35 failed / 17 skipped of 512 in the full run; rerunning the 35 failed
(plus some skips) gave 21 passed / 15 failed / 15 skipped of 51. **21 of
35 failures (60%) needed no code change at all to pass.**

Two candidate explanations were checked directly against the code and
logs, and ruled out:

- **Sub-batch concurrency.** `runSuite` iterates `BATCH1_SUB_BATCHES` in
  a `for...of` loop with `await this.runBatch(...)` — strictly
  sequential, confirmed by reading the code. No two sub-batches ever run
  at once.
- **Sub-batch timeout-kill.** Checked the 2026-09-04 logs for any
  stall/kill/timeout signature around `batch1b`'s window — none. It ran
  to completion and handed off cleanly to `batch1c` afterward.
- **Production and staging cron overlap** (both fire at 00:00 IST, in
  the same container) was raised and considered, but the user confirmed
  this isn't the driver.

What's left, and what docs/adr/0063 already identified as the mechanism
for a similar-looking cluster: `browser` is a session-scoped
pytest-playwright fixture, and `admin_page`/`mentor_page`/etc. are
module-scoped (one login per file) — so `batch1b`
(`tests/roles/scheduling_admin` + `tests/roles/mentor` + `tests/EndToEnd`,
140 tests) ran all three directories through **one browser process** for
however long all 140 took. `scheduling_admin` (76 tests) runs first in
that list, so by the time `mentor`'s tests start, that one browser has
already carried 76 tests' worth of navigation, logins, and page churn.
A long-lived, continuously-active browser process genuinely gets slower
over time (memory growth, accumulated DOM/JS state, connection reuse) —
the same action that completes in well under a second early on can
occasionally cross the 30–60s Playwright action timeout later, with no
defect in the test code. An isolated rerun of one failed test starts a
brand-new browser with zero accumulated wear, so the same action
typically completes quickly.

This doesn't explain the other 40% (15 of 35): those stayed failed on
rerun too, and are the genuine, reproducible bugs already being tracked
separately (docs/adr/0064 and its follow-up commits — the COD
company-popup bug, mentor login-wait bug, `TC_ADMIN_008`'s broken
fallback URL, and still-open items like `TC_SA_0054`'s status filter).

## Decision

Split `batch1b` into three sub-batches, one per directory, mirroring
exactly how batch 1 itself was split in docs/adr/0063 —
`packages/staging-test-runner/src/pytest-staging-test-runner.ts`,
`BATCH1_SUB_BATCHES`:

- `batch1b1`: `tests/roles/scheduling_admin` (76 tests, real
  `--collect-only` count against the current `curatal_tests` `main`)
- `batch1b2`: `tests/roles/mentor` (35 tests)
- `batch1b3`: `tests/EndToEnd` (29 tests)

`BATCH1_SUB_BATCHES` going from 3 entries to 5 required no other code
change — `runSuite`'s progress-weighting (`subBatchWeight = batch1Weight
/ BATCH1_SUB_BATCHES.length`) and per-sub-batch `try`/`catch` isolation
already generalize to however many entries the array holds. Each new
sub-batch still uses the existing `BATCH1_SUB_BATCH_TIMEOUT_MS` (2h)
ceiling, now generous relative to a 76/35/29-test sub-batch instead of
the original 140.

## Consequences

- `mentor` and `EndToEnd` each now start on a browser that has done
  nothing but their own tests — removing the specific "runs after
  scheduling_admin's 76 tests" load path implicated in yesterday's
  failures. This is a mitigation for browser-under-load flakiness, not a
  fix for it: some residual flakiness from each sub-batch's own length
  (76, 35, 29 tests) can still occur, just with a smaller blast radius
  and lower baseline load than before.
- Batch 1 now runs as 6 independent subprocess invocations end to end
  (1a, 1b1, 1b2, 1b3, 1c, then batch 2) instead of 4 — more clone/install
  overhead per run, the same tradeoff docs/adr/0063 already accepted
  going from 2 to 4, traded for smaller, more isolated failure domains.
- Doesn't touch the 40% of yesterday's failures that were genuine bugs —
  those need their own fixes regardless of how finely the batch is
  split, and several are already fixed or still open (docs/adr/0064 and
  follow-ups).
- Not unit-tested, matching this file's existing practice for its
  subprocess-driven orchestration logic — verification happens via the
  next scheduled run.
