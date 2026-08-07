# ADR-0039: COD tests move to a dedicated branch

## Status

Superseded (2026-08-07) — per the user, `cod-automation` has been folded
back into `main`: all test cases (COD included) now live under `main`'s
`tests/` folder, split into per-persona subfolders. `PytestStagingTestRunner`
is back to a single clone/run against `main`, matching docs/adr/0036's
original shape. This ADR is kept for history; do not use it to reason
about the current runner.

## Status (original)

Accepted

## Context

Candidate on Demand (COD) automation used to live at `tests/roles/cod`
on `curatal_tests`' `main` branch, run as part of the same suite as
everything else (docs/adr/0036). The maintainers have since started
actively developing COD coverage on its own branch,
`cod-automation` — a genuinely different, larger, more actively-changing
body of work (its own `pytest.ini`, its own committed `.env`, a broader
in-progress admin/auth/RBAC suite alongside the COD tests specifically).
The user asked to stop running `main`'s now-stale `tests/roles/cod` and
instead pull COD coverage from this dedicated branch.

## Decision

**`PytestStagingTestRunner.run()` now runs two full clone-install-test
cycles in sequence and concatenates their results:**

1. `main` (unchanged branch), with `--ignore=tests/roles/cod` added to
   the pytest invocation — the old in-place COD tests never run from
   here again.
2. The `cod-automation` branch, scoped to `-m cod` — that branch's own
   `pytest.ini` already defines a `cod` marker applied to exactly the
   COD-relevant test files (`tests/cod/test_cod_smoke.py`,
   `tests/master_recruiter/test_mr_cod_end_to_end.py`, etc.), which is
   what actually excludes that branch's broader, unrelated
   admin/auth/RBAC work-in-progress tests from this run. Using the
   suite's own marker is more precise and more durable than guessing at
   directory names — it stays correct even if the maintainers reorganize
   folders again, since it's evaluated by pytest itself at collection
   time from tags the maintainers already apply.

The clone/install/browser-install/run sequence itself is unchanged
per-branch, just extracted into a private `runSuite(branch, pytestArgs)`
method called twice — `run()` is now just those two calls plus
concatenating both results arrays into one `StagingTestRunResult`.

**No new credential handling needed.** The `cod-automation` branch
carries its own committed `.env` (confirmed present in a real clone,
not gitignored) with its own persona set (`ADMIN_EMAIL`, `MR_EMAIL`,
`INTERNAL_RECRUITER_EMAIL`, `PANEL_EMAIL`, `CANDIDATE_EMAIL`, plus
several `*_LOGIN_URL` overrides `main`'s `.env` doesn't have) — its
`config.py` calls `load_dotenv()` with no path argument, which reads
whatever `.env` sits in the process's own cwd. Since each branch gets
its own fresh clone into its own temp dir, that branch's own real `.env`
is simply present and picked up automatically, exactly like `main`'s
already is — no env vars need injecting from this side for either
clone.

**Both clones share the same isolated Playwright browsers path**
(`/ms-playwright-staging`, docs/adr/0036's fix) — same reasoning applies
identically to a second clone: it re-installs its own browser too, and
must never be allowed to touch Node/Playwright-JS's separately-baked
`/ms-playwright`.

## Consequences

- A staging run now takes roughly twice as long in the worst case (two
  full clone+install+browser+pytest cycles instead of one) — accepted as
  the direct cost of running genuinely separate branches; the two
  clones' setup steps aren't parallelized here, matching the existing
  "one step at a time, fail loudly and specifically" philosophy the rest
  of this class already uses.
- If either clone's setup fails (bad clone, `pip install` failure,
  browser install failure), the whole staging run fails — no partial
  "main succeeded, COD didn't" reporting. Consistent with this class's
  existing behavior for a single suite; revisit if partial staging
  results turn out to matter in practice.
- If `cod-automation` is ever merged back into `main` (or COD moves
  again), only the two `runSuite()` call sites in `run()` need to
  change — the branch name and `--ignore`/`-m` scoping are the only
  branch-specific knowledge in this file.

## Addendum: each result now carries its own source URL

Once two branches were feeding into one report, the user had no way to
tell from the report itself whether a given test had actually run from
`main` or from `cod-automation` — a real gap once there's more than one
source at all. `StagingTestResult` (and, on the persisted side,
`QaAutomationTestResult`) gained an optional `sourceUrl`, set by
`runSuite()` to a real, clickable
`https://github.com/.../tree/<branch>[/tests]` link (`.git` stripped)
matching whichever clone actually produced that result. Threaded through
to the DB (new nullable `sourceUrl` column — a migration, not a schema
break), the Excel/PDF reports (a new "Source" column / line), and the
web UI's per-result view. Left `undefined` for production results, which
have only ever had the one source.
