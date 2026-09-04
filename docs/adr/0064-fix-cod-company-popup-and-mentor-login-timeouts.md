# ADR-0064: Root-cause two of today's `Timeout 30000ms exceeded` clusters (COD company popup, mentor login) — fixed in `curatal_tests`, not quarantined here

## Status

Accepted

## Context

The 2026-09-04 staging runs (06:07 UTC and 16:08 UTC) both showed a large
number of `playwright._impl._errors.TimeoutError: Timeout 30000ms
exceeded.` failures. docs/adr/0063 (written the day before, for a
different run) had attributed a similar-looking cluster to the shared
session-scoped `browser` fixture degrading under sustained load. That
theory doesn't hold for the two clusters below: both reproduced
identically, at the very start of a fresh sub-batch, in two independent
runs hours apart — the signature of a deterministic bug, not load-related
flakiness.

**Cluster 1 — COD job creation via the admin persona.** All 12 tests in
`tests/roles/cod/admin/test_admin_cod_job_negative.py`
(`TC_ADMIN_NEG_001`–`012`) failed identically in both runs, always at the
same place: `_setup_admin_create_job()` calls
`form.select_company("The Agora Companies")` and then unconditionally
waits on the "Which Hiring Service would you like to use?" popup
(`verify_hiring_service_popup()`, `create_job_helper.py:357`). Live
reproduction confirmed the popup never appears for that company — the
aria snapshot at failure time shows the Create Job form already fully
rendered, meaning the app skipped straight past the popup. Likely cause:
"The Agora Companies" already has a hiring-service preference cached from
an earlier successful run against it. The one COD-admin test that _did_
pass, `test_admin_cod_job_end_to_end.py`, uses a different company,
`"Curatal-Staging-Test"`, which still shows the popup.
`tests/roles/admin/test_create_job.py::test_admin_create_cod_job_positive`
had the identical bug (same `select_company("The Agora Companies")` +
`verify_hiring_service_popup()` pair).

**Cluster 2 — mentor persona login.** Every mentor test that performs its
own fresh login (rather than using the pre-authenticated `mentor_page`
fixture) failed the same way: `TestMentorLoginFeature.test_TC_MTR_012_logout`,
all of `TestMentorOnboarding` (`TC_MTR_029`–`036`), and every test in
`test_scheduling.py` and `test_support.py`. Five files
(`test_access_control.py`, `test_onboarding.py`, `test_scheduling.py`,
`test_support.py`, `test_dashboard.py`) each carried their own
copy-pasted `_fill_and_submit(page, email, password)` helper, submitting
the login form and then calling
`page.wait_for_url("**/app/**", timeout=TIMEOUT)` (30s,
navigation-event-based). The one login path that has always worked —
`conftest.py`'s `_do_login`, used by every persona's session fixture
(`admin_page`, `mentor_page`, etc.) — instead uses
`page.wait_for_function("() => window.location.href.includes('/app/')",
timeout=TIMEOUT * 2)`: 60s of DOM polling rather than 30s tied to
Playwright's own navigation-event tracking. `test_dashboard.py`'s copy
was subtly different: it already delegated to the working `_do_login`
(via a thin re-export, `automation/flows/authentication.py`) but then
added a redundant `wait_for_url` check on top, which could still time out
even after `_do_login` itself had already succeeded — most likely because
this app's post-login redirect is client-side (SPA) routing, which
Playwright's navigation-event tracking doesn't reliably observe, while
polling the raw `window.location.href` value does.

## Decision

Fixed at the source in `curatal_tests` (external repo,
`codewithVsingh/curatal_tests`, pushed directly to `main` — the current
user has write access there) rather than quarantining in this repo's
`QUARANTINED_BATCH1_TESTS`, since both were reproducible, understood bugs
with a one-line fix, not open-ended flakiness:

- `3ec1d9c` — `test_admin_cod_job_negative.py`: switched
  `select_company("The Agora Companies")` →
  `select_company("Curatal-Staging-Test")`. Verified live: all 12 tests
  pass (347.57s).
- (follow-up, same fix) `test_create_job.py::test_admin_create_cod_job_positive`:
  identical company swap.
- `009deff` — `test_access_control.py` and `test_onboarding.py`: both
  `_fill_and_submit` copies switched to the `wait_for_function(...,
timeout=TIMEOUT * 2)` pattern already proven in `_do_login`. Verified
  live: `test_TC_MTR_012_logout` passes; `test_TC_MTR_029` clears the
  login step cleanly (it still fails afterward, but only because the
  shared `newmentor` fixture account has already completed onboarding
  from an earlier run — a pre-existing data-freshness issue this fix
  doesn't touch, already flagged by `config.py`'s own comment next to
  `CREDENTIALS["newmentor"]`).
- `4a570b5` — `test_scheduling.py` and `test_support.py`: identical
  `wait_for_function` swap. `test_dashboard.py`: removed the redundant
  trailing `wait_for_url` instead, since `_do_login` already confirms the
  redirect. Verified live:
  `test_TC_MTR_019_navigate_to_set_available_slots` and
  `test_TC_MTR_018_session_type_options_visible` both pass.

## Consequences

- No change needed in `code-quality-platform` itself — both fixes landed
  in the test source, so the next scheduled staging run picks them up
  automatically without any quarantine-list edit here.
- `docs/adr/0063`'s "browser degrading under sustained load" theory
  still stands for whatever's left over after these two clusters are
  subtracted out (it was based on a broader, less deterministic pattern
  spread across many files/personas) — but these two specific clusters
  were mischaracterized by that theory and are now understood as
  standalone bugs, not load effects.
- Five separate copies of `_fill_and_submit` across the mentor test files
  (four broken, one already-correct-but-redundant) is real duplication in
  `curatal_tests` — worth consolidating into one shared helper (e.g.
  reusing `conftest.py`'s `_do_login` directly) so this class of bug
  can't reappear by copy-paste into a sixth file later. Not done here to
  keep each fix minimal and independently verifiable.
- Two more clusters raised in the same investigation are still open and
  under active triage as of this writing: `test_TC_ADMIN_012_add_coach_successfully`
  (fails on missing `MS_GRAPH_TENANT_ID`/`MS_GRAPH_CLIENT_ID`/`MS_GRAPH_CLIENT_SECRET`
  — a Railway environment-configuration gap in `code-quality-platform`,
  not a `curatal_tests` bug) and a set of `scheduling_admin` timeout/data
  failures (`TC_SA_0038`, `TC_SA_0054`, `TC_SA_0064`) plus
  `TC_ADMIN_008_search_filter_users`, which had already drawn an earlier,
  unfinished investigation (three leftover scratch scripts in
  `packages/db/*.tmp.mjs` querying prior runs' stored failure details).
