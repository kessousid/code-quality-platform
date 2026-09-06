# ADR-0069: Split `batch1a` into `batch1a1`/`batch1a2` by directory

## Status

Accepted

## Context

The user reported the 2026-09-05/06 scheduled run only ran 490 of the
expected 521 tests, with 208 "failed." Investigation via Railway logs
(`qa-automation` service, the run's own timestamp window) found:

- **132 of the 208 were `ERROR`, not `FAILED`.** Only 76 were genuine
  test failures. `ERROR` in pytest means a fixture failed during setup —
  the test body never ran at all.
- The exact signature confirms this: all 12 tests in
  `test_admin_cod_job_negative.py` errored at the identical microsecond,
  and separately all 3 tests in `test_mr_negative_validations.py` did
  the same — pytest's behavior when a shared, module-scoped fixture
  (`admin_page`, `masterrecruiter_page`) fails during its own login
  setup: every test depending on it errors immediately, in a batch,
  without any of them individually running.
- This was **intermittent, not a permanent crash**: `test_cod_dashboard.py`
  and `test_mr_live_status.py` (different files, same personas) logged in
  and ran fine in the same window, between the failing clusters.
  Consistent with staging's own login being unstable that night, not a
  permanently dead browser process or a code regression.
- `batch1a` (`cod` + `candidate` + `admin` + `interviewer` + 3 loose
  files, 135 tests, normally ~40 minutes) never recovered pace and ran
  its **full 2-hour ceiling** before being killed: confirmed directly —
  _"pytest report... was never written (timed out: true) — recovered
  100 result(s) from the report-log fallback."_ Only ~101 of its 132
  selected tests ever started; ~31 never ran at all, accounting for most
  of the 521 → 490 shortfall.
- Every observed fixture-failure cluster that night lived specifically
  under `tests/roles/cod` (`cod/admin`, `cod/master_recruiter`) — `cod`
  is also 81 of `batch1a`'s 135 tests, the majority of the batch.

This is the same mechanism docs/adr/0063 and docs/adr/0065 already
diagnosed and mitigated for `batch1b` — `batch1a` was never given the
same treatment and hit it independently.

## Decision

Split `batch1a` into two sub-batches by directory, same pattern as
`batch1b`'s three-way split — `packages/staging-test-runner/src/pytest-staging-test-runner.ts`,
`BATCH1_SUB_BATCHES`:

- `batch1a1`: `tests/roles/cod` (81 tests — the majority, and where the
  fixture failures actually clustered).
- `batch1a2`: `tests/roles/candidate` + `tests/roles/admin` +
  `tests/roles/interviewer` + the 3 loose top-level debug files (54
  tests). Carries `QUARANTINED_BATCH1_TESTS`' deselect (both quarantined
  node IDs live under `tests/roles/admin`).

Re-verified via real `pytest --collect-only` (the method docs/adr/0063
established): the union of all six batch1 sub-batch paths (`1a1`, `1a2`,
`1b1`, `1b2`, `1b3`, `1c`) collects exactly 423, matching the full-suite
ground truth exactly, zero duplicates.

## Consequences

- A repeat of that night's login instability now costs at most 81 tests
  and their own 2h ceiling (if it hits `cod`) instead of the whole
  135-test batch — smaller blast radius, same as `batch1b`'s split
  already achieved for that side of batch 1.
- This is a mitigation, not a fix: it doesn't make staging's login more
  stable, it only limits how much one bad night costs. If `cod` alone
  starts regularly hitting its own ceiling, it may be worth splitting
  further by its own subdirectories (`cod/admin`, `cod/candidate`,
  `cod/master_recruiter`, `cod/roles`).
- Batch 1 now runs as 7 independent subprocess invocations end to end
  (1a1, 1a2, 1b1, 1b2, 1b3, 1c, then batch 2) instead of 6 — more
  clone/install overhead per run, the same tradeoff already accepted
  each time this array has grown.
- Doesn't address the 76 genuine `FAILED` results from that run, which
  are a mix of already-tracked open issues (`TC_SA_0054/0064/0038`, the
  panel_admin payment-report download) and whatever else that specific
  night's instability caused — those still need their own diagnosis.
