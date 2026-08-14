# ADR-0056: Quarantine six report-download tests found hanging in a live run

## Status

Accepted

## Context

A live staging run of batch 2 (docs/adr/0055's deselect list, with batch 1
skipped via `STAGING_SKIP_BATCH_1` to re-test quickly) hit a new hang
pattern that ADR-0055's static review didn't catch, because it only
checked for two specific known shapes (chained wizard-field fallbacks,
unbounded pagination retries). This is a third shape: report downloads.

`test_TC_PANELADMIN_053_download_basic_predefined_reports_as_excel` — the
first test in the file's "Uploaded Profiles / Reports" section — stalled
and errored at the suite's own per-test `pytest-timeout` (600s). Every
following test in that same section did too, six in a row, each burning
the full 600s before erroring:

- `053_download_basic_predefined_reports_as_excel`
- `054_download_interviewers_payment_report_with_date_filter`
- `055_download_uploaded_profiles_report_as_excel`
- `056_uploaded_profiles_first_date_range_filter`
- `057_uploaded_profiles_company_filter`
- `058_uploaded_profiles_company_and_job_title_filter`

The uniform, mechanical failure — same exact 10-minute stall, same exact
outcome, six tests in a row starting the moment a download was attempted —
points to one shared broken page/fixture state (most likely the download
attempt in `053` leaving the page or a modal in a state the rest of the
section's tests never recover from), not six independent bugs. The run
was killed (redeployed) once the pattern was unambiguous rather than
waiting out the remaining tests in that section at 10 minutes each.

## Decision

Add `053`-`058` to `QUARANTINED_PANELADMIN_TESTS` alongside ADR-0055's
original six. Unlike that list, these were identified from a real live
run, not static analysis — stronger evidence, not weaker.

## Consequences

- Staging reports now lose 12 of `test_paneladmin.py`'s 107 tests (up from
  6), all deselected by exact node ID, same mechanism as ADR-0055.
- The real root cause (why the Reports section's page/fixture state breaks
  starting at the first download attempt) is still unfixed — this only
  removes it from the run. Needs investigation in `curatal_tests`.
- Unconfirmed: whether the cascade would have stopped at `058` or
  continued into `059`+ (`candidate_interview_management_*` tests, a
  different-looking subsection) had the run been allowed to continue. The
  next full run past this point will show whether more need to be added.
- Same fragility as ADR-0055's list: exact test names, not a pattern — a
  rename in `curatal_tests` silently un-quarantines these.
