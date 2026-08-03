# ADR-0036: Staging QA automation via an external pytest suite + Excel alert reports

## Status

Accepted

## Context

Production QA automation (ADR-0035) verifies `portal.curatal.com` with an
in-repo Playwright/TypeScript test registry on a user-adjustable interval.
The user also wants a second, independent leg against staging
(`https://staging.curatal.com/`), but staging's test cases already live in
a separate, shared GitHub repo
(`https://github.com/codewithVsingh/curatal_tests`, public) that another
team keeps updating. Cloning and inspecting that repo directly (not
guessing at its shape) confirmed: it is a real Python/pytest/
`playwright-python` suite, ~15,600 lines across 8 personas, invoked via
`python -m pytest tests/ --browser chromium` with no `pytest.ini`/
`pyproject.toml`/`setup.cfg` (so `--junitxml` is safe to add without
config conflicts). This is a genuinely different tech stack from this
repo's own TS Playwright tests — the right integration is to run it as a
real subprocess and parse its output, never reimplement it in TypeScript.

Confirmed with the user: production keeps its existing configurable-hours
schedule unchanged; staging instead gets a fixed "once daily at midnight
IST" schedule plus a manual-trigger option, not a user-adjustable
interval; and failure alert emails should attach an Excel workbook instead
of a PDF (the on-demand "Generate report" button still offers both).
Separately, real production slot data was observed to flicker (a Priority
slot briefly absent, then present again) — addressed by a retry-with-
audit-trail helper in `packages/qa-automation-tests`, unrelated to this
staging work.

## Decision

**A new port + adapter for running the external suite**, mirroring
`EmailSender`/`NodemailerEmailSender`'s split: `packages/core` defines
`StagingTestRunner { run(): Promise<StagingTestRunResult> }`
(`StagingTestRunResult = { results: { testId, testName, passed, details }[] }`).
A new package, `packages/staging-test-runner`, holds
`PytestStagingTestRunner` — on each `run()`, shallow-clones the repo fresh
into a temp dir (always the latest version, per "keeps getting updated"),
installs its `requirements.txt`, re-runs `playwright install --with-deps
chromium` (the repo's own `requirements.txt` can bump the `playwright`
package version at any time, so the installed browser build has to track
whatever version pip just installed, not whatever was baked into the
image at build time), runs `python3 -m pytest tests -v --browser chromium
--junitxml=<tmp>.xml` via the _existing_ `runSubprocess` helper in
`packages/plugin-shared` (already used for gitleaks/semgrep/osv-scanner —
same "shell out to a real external tool" pattern), and parses the JUnit
XML with `fast-xml-parser` (new, small dependency). `testId` combines the
JUnit `classname` + `name` attributes rather than pytest's own
`::`-separated node-ID syntax, since JUnit XML never records that form
directly — equally unique and stable for matching a result back to a run.

**A new, much simpler use case for staging** — no per-test frequency
gating, no per-test browser page, since the whole suite is one opaque
subprocess call. `RunStagingTestSuiteUseCase(runRepository,
resultRepository, testRunner: StagingTestRunner, emailSender,
alertEmailTo, alertEmailCc?)` mirrors `RunQaAutomationSuiteUseCase`'s
create-run → run → persist-results → complete → alert-on-failure shape,
delegating all execution to `testRunner.run()`.

**`QaAutomationRun` gains an `environment: 'production' | 'staging'`
field** (core type, db enum + migration defaulting existing rows to
`'production'`, repository, mappers) — this is what distinguishes a
production run (always via the existing TS test registry) from a staging
run (always via the subprocess path). Individual `PortalAutomationTest`s
are untouched; environment is a property of _how a run was produced_, not
of a test definition.

**Staging gets its own minimal schedule entity**, not a bolt-on to the
existing `QaAutomationSchedule`: `QaAutomationStagingSchedule { orgId,
enabled }` — no interval field, since the cron pattern itself (`0 0 * * *`,
`tz: 'Asia/Kolkata'`) is a fixed constant in code, not user-configurable,
matching what the user actually asked for.

**A second BullMQ queue/worker in the same `apps/qa-automation` service**
— `qa-automation-staging`, using `upsertJobScheduler`'s `pattern`+`tz`
option (production uses `every`). One Railway service, one Redis
connection, one container, registering a second `Worker` alongside the
existing one; the Dockerfile's runtime stage additionally installs
Python3/pip/`pytest`/`pytest-playwright`/`playwright`/`pytest-html` and
runs `python3 -m playwright install --with-deps chromium` at build time —
kept as an _addition_ to the existing Node/Playwright-JS runtime image,
not a base-image swap, so the already-working production path is never
put at risk. The real suite is large (100+ real browser tests across 8
personas) and could plausibly run for 30–90+ minutes, so the staging
worker is constructed with a generous `lockDuration`/`stalledInterval`
(2 hours) and `maxStalledCount: 0`, so a long-but-healthy run is never
mistaken for a stuck one.

**Excel report format added alongside PDF**, mirroring
`ExcelUnitTestReportGenerator` exactly (same `exceljs` dependency, already
a `packages/reporting` dependency): `QaAutomationReportFormat` becomes
`'pdf' | 'xlsx'` (core, db enum + migration, mappers, DTO validation).
Both `RunQaAutomationSuiteUseCase` (production) and
`RunStagingTestSuiteUseCase` (staging) switch their **failure-alert email
attachment** to `.xlsx`; the on-demand "Generate report" button in the UI
keeps both formats available.

**API additions**, all on the existing `QaAutomationController`:
`GET/PUT /qa-automation/staging/schedule` (just `enabled`), `POST
/qa-automation/staging/runs` (manual trigger, enqueues onto the staging
queue), and `GET /qa-automation/runs` gains an `environment` query param
that defaults to `'production'` at the controller — preserving existing
callers' behavior exactly, rather than suddenly mixing both environments
into one list.

**Web UI**: `QaAutomationPage.tsx` now renders two independent sections,
each its own `<section aria-label="… QA Automation">` region — Production
(existing schedule/interval UI, unchanged) and Staging (its own
enable/disable toggle with no interval input, its own "Run now" button,
its own run history) — both reusing the same `RunResults`/
`RunReportActions`/`RunHistoryList` components, parameterized by
`environment`.

## Consequences

- The staging suite's own credentials (candidate/employer/coach/mentor/
  admin/schedulingAdmin personas) live in that external repo's own
  `config.py`, committed there by its own maintainers — not introduced or
  further propagated by this integration, since the suite is cloned and
  run as-is, never copied into this repo.
- Every staging run re-clones the repo and re-installs its Python
  dependencies from scratch — accepted, since "always the latest version"
  was an explicit requirement, and pre-installing the common packages +
  Chromium at Docker build time (docs above) absorbs most of the
  otherwise-repeated setup cost.
- `PytestStagingTestRunner` has no visibility into _why_ a test failed
  beyond whatever JUnit XML records (a `<failure>`/`<error>` message and
  traceback) — deeper diagnosis of a staging failure still requires
  looking at the external repo directly, same as before this integration
  existed.
- A `<skipped>` JUnit testcase is recorded as `passed: true` with a
  `SKIPPED: …` detail prefix, not as a distinct third state —
  `QaAutomationTestResult.passed` is a plain boolean, so a skip is treated
  as "did not fail" rather than triggering a false alert.
- One Railway service now runs two independent long-lived BullMQ workers
  in one Node process — an accepted simplification (no new service, no
  new Redis connection) over splitting staging into its own deployment.
