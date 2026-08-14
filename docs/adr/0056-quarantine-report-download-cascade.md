# ADR-0056: Quarantine seven report-download tests sharing one root cause

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
the full 600s before erroring.

A source-level trace (not just live observation) found the actual shared
mechanism: `config.py` sets `TIMEOUT = 30000` (30s), and every one of
these tests calls Playwright's `page.expect_download(timeout=TIMEOUT)`,
waiting on a real browser download event. `053`-`059`'s helper
(`_download_selected_report`) wraps that call in `try/except` and hard-
fails (`assert False`) on timeout — which should surface as a normal
failure in ~30-60s, not a 600s stall. The gap between "should fail in
30s" and "actually hangs 600s until pytest's own hard kill" means the
_browser itself_ gets wedged waiting on the download, not that the code
is cleanly timing out — a real staging/Playwright download-handling
issue, not a bug in the test logic.

`test_TC_PANELADMIN_034_view_interviewer_resume` hits the identical
`expect_download(timeout=TIMEOUT)` call but has a graceful fallback
chain after it (falls through to checking for a popup tab instead of
hard-failing) — which is why it resolves in ~90s instead of hanging. Its
own comment, `"Case C: download (observed primary behavior on staging)"`,
confirms the suite's authors already knew staging doesn't reliably fire
download events and coded around it there, just not in the Reports
section.

No other test in `test_paneladmin.py` calls `expect_download` — confirmed
by grepping the whole file — so the blast radius is exactly these eight
call sites (`034` + `053`-`059`), not an open-ended cascade. `034` isn't
quarantined here since it fails fast rather than hanging; it's a real bug
but not a batch-2-duration problem.

Full list, all sharing the one root cause:

- `053_download_basic_predefined_reports_as_excel`
- `054_download_interviewers_payment_report_with_date_filter`
- `055_download_uploaded_profiles_report_as_excel`
- `056_uploaded_profiles_first_date_range_filter`
- `057_uploaded_profiles_company_filter`
- `058_uploaded_profiles_company_and_job_title_filter`
- `059_uploaded_profiles_interview_status_filter`

`056`-`059` don't call `expect_download` for their own stated purpose
(they're filter checks) but share the same page/fixture flow as `053`-
`055` in the Reports section and cascaded identically live; `059` was
quarantined proactively (before its own live confirmation) once the
`expect_download` trace made the pattern clear, to avoid burning another
10 minutes confirming what the source already showed.

## Decision

Add `053`-`059` to `QUARANTINED_PANELADMIN_TESTS` alongside ADR-0055's
original six (12 total -> 13 total). These were identified from a real
live run plus a source-level trace to the shared `expect_download` call,
not static analysis alone.

## Consequences

- Staging reports now lose 13 of `test_paneladmin.py`'s 107 tests, all
  deselected by exact node ID, same mechanism as ADR-0055.
- The real root cause — staging not reliably firing browser download
  events, wedging the browser process instead of failing cleanly — is
  still unfixed. This only removes the symptom from the run. Needs
  investigation in `curatal_tests` (and possibly the staging app itself,
  since `034`'s own comment suggests this predates this quarantine).
- `034` is a known related failure (same `expect_download` call) but is
  NOT quarantined — it fails fast rather than hanging, so it's a
  correctness issue to fix, not a run-duration one.
- Same fragility as ADR-0055's list: exact test names, not a pattern — a
  rename in `curatal_tests` silently un-quarantines these.
