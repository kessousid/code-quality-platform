# ADR-0055: Quarantine six specific hang-prone tests instead of the whole test_paneladmin.py file

## Status

Accepted

## Context

docs/adr/0054 disabled `test_paneladmin.py` entirely (all 107 tests) to
unblock the rest of the suite while the real cause of its repeated hangs
was investigated. That investigation was a static, read-only review of
the whole file (no test execution) looking for known hang-causing
patterns — large/unbounded waits, retry loops gated on live data,
oversized timeouts.

The file's default timeout (`TIMEOUT = 30000`, 30s) is used consistently
throughout via `expect(...).to_be_visible(timeout=TIMEOUT)`; there are no
raw `time.sleep()` calls and no unbounded Python `while` loops anywhere
in the file. The risk that emerged instead is chained/nested waits: many
30s `expect()` calls stacked across fallback branches, or retry loops
with high iteration counts multiplied by fixed per-iteration waits.

Six tests concretely matched this shape:

- `test_TC_PANELADMIN_049_add_interviewer_account_number_mismatch_validation`
  — the confirmed live culprit (20-30+ min stuck, per docs/adr/0052).
  Drives the Add-Interviewer wizard through ~30 nested helper functions,
  nearly all with their own 30s `expect()` and a fallback branch on miss;
  a single UI-text/selector mismatch cascades into several stacked 30s
  timeouts.
- `test_TC_PANELADMIN_050_...invalid_ifsc_and_pan_validation`,
  `test_TC_PANELADMIN_051_...invalid_banking_document_upload`,
  `test_TC_PANELADMIN_052_add_interviewer_successfully` — share
  `TC_PANELADMIN_049`'s exact wizard scaffold and helper-fallback chain;
  not yet caught live, but structurally identical.
- `test_TC_PANELADMIN_007_assign_recommended_interviewer`,
  `test_TC_PANELADMIN_008_unassign_proposed_interviewer` — a different
  shape: nested pagination/retry loops (up to 8 attempts × up to 25
  pagination scans in `007`) gated on a live-data condition (whether a
  given job has any recommended interviewers) with no upper bound if that
  condition never holds.

The other ~101 tests in the file showed no such pattern — fixed
iteration counts, normal single 30s `expect()` calls — and are not
implicated by anything observed so far.

## Decision

Re-enable batch 2 (`test_paneladmin.py`, docs/adr/0053), but deselect the
six tests above by exact pytest node ID
(`QUARANTINED_PANELADMIN_TESTS` in `PytestStagingTestRunner`) rather than
skipping the whole file. The other ~101 tests in `test_paneladmin.py` run
normally as part of batch 2, alongside the ~400 tests in batch 1.

`RUN_PANELADMIN_BATCH` (docs/adr/0054) is kept as a coarser escape hatch
— set to `false` to drop batch 2 entirely again if a problem resurfaces
outside the six quarantined tests.

## Consequences

- Staging reports lose coverage of exactly six tests (007, 008, 049,
  050, 051, 052) instead of all 107 — the other ~101
  `test_paneladmin.py` tests are back in every run's results.
- This is a mitigation, not a fix: none of the six quarantined tests'
  underlying causes (fragile wizard-field fallback chains; unbounded
  data-dependent retry loops) have been changed. They need real fixes in
  `curatal_tests` — likely reworking `TC_PANELADMIN_049`'s helper
  fallback chain to fail fast instead of cascading through multiple 30s
  timeouts, and giving `007`/`008` an explicit bound with a clear
  failure message instead of an open-ended retry — before being
  un-quarantined.
- The quarantine list is exact test names, not a pattern — if these
  tests are renamed in `curatal_tests`, the `--deselect` flags will
  silently stop matching and the tests will start running again
  un-quarantined. Worth revisiting if `curatal_tests` renames anything
  in this file.
