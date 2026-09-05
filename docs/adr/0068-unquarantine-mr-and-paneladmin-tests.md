# ADR-0068: Un-quarantine `TC_MR_005`/`006` and `TC_PANELADMIN_048`/`086`; keep interview-queue tests quarantined

## Status

Accepted

## Context

After the 2026-09-05 full run, the user asked to run all six currently
quarantined tests individually to check which ones are safe to bring
back. Ran each with a scoped rerun against live staging:

- `TC_PANELADMIN_048_add_interviewer_banking_required_fields_validation`
  and `TC_PANELADMIN_086_change_interviewer_successful_change`: **both
  passed**, 21m01s total (~10.5min each). Matches the "if a future run
  shows both passing reliably, re-verify and un-quarantine" note already
  on this entry — confirmed.
- `TC_MR_006_Shortlist_Candidate` and
  `TC_MR_005_Shortlist_Specific_Candidate`: **neither hung** — resolved
  as XFAIL and SKIPPED respectively, 41m45s combined, no timeout at all.
  Consistent with this entry's own "intermittent staging-side flakiness,
  not a deterministic bug" read.
- `test_admin_verify_interview_queue_candidate` and
  `test_admin_view_interview_queue_candidate`: **still not clean**. Ran
  30m10s combined, resolving XFAIL rather than hanging forever (the
  helper's own 100-page loop cap does eventually stop it, so this was
  never a literal infinite hang) — but ~15 minutes per test just to
  reach that XFAIL is still unacceptable for a scheduled run per se, and
  the root cause (`open_cod_job_with_interview_candidates`'s missing
  `max_jobs` bound, docs/adr's own earlier note) is confirmed still
  present in `curatal_tests` as of this check.

## Decision

`packages/staging-test-runner/src/pytest-staging-test-runner.ts`:

- `QUARANTINED_PANELADMIN_TESTS` emptied (`[]`).
- `QUARANTINED_BATCH1_TESTS` now holds only the two interview-queue node
  IDs; `TC_MR_005`/`006` removed.
- Doc comments updated in place recording today's re-verification result
  for each entry, rather than deleted, so the next person doesn't have
  to re-derive why a given test was ever quarantined.

`packages/core/src/qa-automation-run.ts`'s `CURRENTLY_QUARANTINED_TEST_NAMES`
(kept manually in sync with the runner's lists per its own doc comment)
updated to match: now just the two interview-queue bare names.

## Consequences

- The next scheduled/manual staging run will include all four
  re-verified tests again. `TC_PANELADMIN_048`/`086` are still right at
  the edge of the 600s per-test ceiling (~10.5min observed) — worth
  watching the next few runs and re-quarantining immediately on any
  repeat timeout rather than assuming this margin holds.
- The interview-queue tests remain excluded. Un-quarantining them for
  real requires the fix landing in `curatal_tests` itself
  (`open_cod_job_with_interview_candidates` regaining its `max_jobs`
  bound), not just a re-verify — re-verifying without that fix would
  only confirm the same ~15-minute-per-test cost again.
