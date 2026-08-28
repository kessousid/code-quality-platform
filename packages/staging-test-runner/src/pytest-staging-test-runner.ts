import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult, StagingTestResult } from '@cqp/core';
import { runSubprocess, SubprocessTimeoutError, type SubprocessResult } from '@cqp/plugin-shared';
import { parseJunitXml } from './junit-xml-parser.js';
import { parseReportLog } from './report-log-parser.js';

/**
 * Prepended to `details` for a result recovered from the `--report-log`
 * fallback instead of the normal `--junitxml` report (docs/adr/0057) --
 * reuses the existing details-string-marker convention (same idea as the
 * `SKIPPED:` prefix below) rather than adding a new StagingTestResult
 * field, so no schema/reporting-layer change is needed to see it. `SKIPPED:`
 * itself must stay the leading token when present -- every existing
 * details-text check (isSkippedTestResult, isQuarantinedTestResult, the
 * Excel generator's own grep) anchors on it at position 0.
 */
const RECOVERED_MARKER =
  '[RECOVERED -- batch ended abnormally before the normal report was written; see docs/adr/0057] ';

function markRecovered(details: string): string {
  return details.startsWith('SKIPPED:')
    ? `SKIPPED: ${RECOVERED_MARKER}${details.slice('SKIPPED:'.length).trimStart()}`
    : `${RECOVERED_MARKER}${details}`;
}

/**
 * `runSubprocess` deliberately doesn't treat a non-zero exit as failure —
 * that's correct for the final pytest invocation (non-zero means "a test
 * failed", not "the runner failed"), but for the setup steps ahead of it
 * (clone/install), a non-zero exit means the step itself didn't do what it
 * was supposed to, and silently continuing produces a confusing generic
 * "report.xml not found" error with no clue which step actually broke.
 */
function requireZeroExit(step: string, result: SubprocessResult): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `${step} exited with code ${result.exitCode}.\nstderr: ${result.stderr.trim()}\nstdout: ${result.stdout.trim()}`,
    );
  }
}

/**
 * Deliberately NOT the default browsers path (`/ms-playwright`, shared
 * with this same container's Node/Playwright-JS install — see docs/adr/0035,
 * docs/adr/0036). Confirmed live in production: since this class
 * reinstalls its own browser on every single run (the external repo's
 * requirements.txt can bump its pinned Playwright version at any time),
 * that reinstall's own cleanup logic doesn't recognize Node's separately-
 * baked chromium as "claimed" and prunes it out from under the production
 * runner — a real incident (`browserType.launch: Executable doesn't exist
 * at /ms-playwright/chromium-1140/...`), not a hypothetical one. Isolating
 * this path is what actually fixes it, not just avoiding a race — even
 * back-to-back (non-overlapping) runs hit this, since the file is simply
 * gone by the next production launch.
 */
const STAGING_PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright-staging';

/**
 * Live-confirmed necessary (docs/adr/0045): two separate real staging runs
 * each hung for 2+ hours at the same point (a `admin_page` fixture/test
 * combination) with zero output, even with stdout unbuffered — genuinely
 * stuck, not just slow. This still needs to exist even after per-test
 * pytest-timeout was added (docs/adr/0052) — that only bounds a single
 * test's own execution and can't catch a stall between tests or below
 * pytest's own event loop.
 *
 * Raising this alone (3h -> 6h, still docs/adr/0052) didn't actually fix
 * anything: a third live run on 2026-08-13/14 still got killed, this
 * time at 85% after 6 hours. One giant ceiling shared across the whole
 * suite means one slow stretch anywhere eats into the budget every other
 * test needs too. docs/adr/0053 splits the run into two independent
 * batches instead (see `runSuite` below) — each gets its own ceiling, so
 * a slow patch in one batch can no longer starve the other.
 *
 * Raised again 3h -> 5h per user request (docs/adr/0054) — this now
 * applies per-batch (not to the whole suite, see docs/adr/0053), so it's
 * a genuinely different, more generous number than the original 0045
 * figure even though it looks similar.
 */
const MAX_PYTEST_DURATION_MS = 5 * 60 * 60 * 1000;

/**
 * `test_paneladmin.py` alone is ~107 of the suite's ~512 tests (~21%) —
 * confirmed live (docs/adr/0053) as the one file every stall/slow-stretch
 * observed on 2026-08-13/14 happened inside (always in the 74-85%
 * progress range, three separate real runs). Running it as its own
 * batch, with its own timeout ceiling independent of the other ~400
 * tests, is what actually stops one slow file from starving everything
 * else's time budget — raising the single shared ceiling didn't.
 */
// Path updated 2026-08-19 -- curatal_tests commit b83ed99 (2026-08-18)
// moved this file to tests/roles/panel_admin/test_paneladmin.py without
// notice. The stale old path here silently broke both batches on the very
// next scheduled run: batch 1's --ignore no longer matched anything real
// (so it absorbed the whole unquarantined paneladmin file and hung on the
// exact tests QUARANTINED_PANELADMIN_TESTS exists to keep out, eating the
// full 5h ceiling), and batch 2's target path collected zero tests. Only
// the unconditionally-appended quarantine stub rows survived, which is why
// that run's report showed just 12 results instead of ~500.
const PANELADMIN_FILE = 'tests/roles/panel_admin/test_paneladmin.py';

/**
 * Batch 2 (`test_paneladmin.py`) is re-enabled (docs/adr/0055), minus
 * whatever's still listed below (currently nothing).
 *
 * `007`/`008` were quarantined for an unbounded-retry hang (docs/adr/0055),
 * then un-quarantined once curatal_tests PR #14 bounded the actual
 * unguarded `.inner_text()` waits behind it — confirmed live (2026-08-15
 * scheduled run): both ran cleanly in ~70s each.
 *
 * `048`-`052` (banking details validation/add-interviewer) and `053`-`059`
 * (report downloads, all sharing a `page.expect_download` hang root cause
 * -- staging didn't reliably fire download events) were quarantined after
 * a real cascading-hang incident, then un-quarantined per the user
 * (2026-08-25): the underlying fixes have since landed in curatal_tests,
 * so a fresh run should include them again. If any of these start hanging
 * again, re-add them here rather than re-diagnosing from scratch --
 * `048`/`049`/`050`/`052` shared a `_find_banking_field` chained-wizard-
 * fallback cascade, `051` had no comparable root cause found, and
 * `053`-`059` all called `page.expect_download(timeout=TIMEOUT)`.
 *
 * `048` and `086` re-quarantined per the user (2026-08-28). Confirmed
 * live, twice independently: `048` hit pytest's own 600s per-test
 * timeout both under a fixture-isolation experiment (since reverted) and
 * under the plain original fixture -- it's one of the longest,
 * step-heaviest tests in this file (five wizard steps, two full
 * validation passes), so it has very little time budget margin even when
 * healthy. In the same scoped run, `086` (running right after `048`)
 * ALSO hit the ~600s timeout, and the whole run's own session-end
 * `context.close()` teardown then hung for 5+ minutes afterward, needing
 * a manual container restart to clear -- a real Playwright edge case
 * where a page/context left mid-action by a signal-based timeout can
 * block its own `.close()` call. Worth noting: a full scheduled run two
 * days before this (2026-08-26) completed all ~525 tests cleanly,
 * including both of these -- so this may be scoped-single-test-rerun-
 * specific or transient staging slowness rather than a hard, permanent
 * hang. If a future full run shows both passing reliably again, these
 * are reasonable to re-verify and un-quarantine, same as every other
 * entry in this list.
 */
const RUN_PANELADMIN_BATCH = true;

const QUARANTINED_PANELADMIN_TESTS: string[] = [
  'test_TC_PANELADMIN_048_add_interviewer_banking_required_fields_validation',
  'test_TC_PANELADMIN_086_change_interviewer_successful_change',
];

/**
 * Batch 1's own quarantine list (docs/adr/0055's pattern, applied outside
 * test_paneladmin.py for the first time). Full `file::Class::test` node
 * IDs, not bare names -- unlike `QUARANTINED_PANELADMIN_TESTS`, batch 1
 * isn't scoped to one file, so a bare name alone wouldn't be enough to
 * build a `--deselect` flag.
 *
 * `TC_SA_0068`/`TC_SA_0069` (tests/roles/scheduling_admin/test_netting.py)
 * carried a working `@pytest.mark.skip(reason="Hangs indefinitely")` right
 * up until curatal_tests commit b83ed99 (2026-08-18) commented both out.
 * The same commit's unrelated `test_paneladmin.py` move already caused one
 * lost run (see PANELADMIN_FILE's comment) by letting a hang-prone test
 * back into batch 1 uncontrolled -- deselecting these here rather than
 * waiting to see if they hang for real on a live run.
 *
 * `TC_SA_0068`/`TC_SA_0069` un-quarantined per the user (2026-08-27).
 * `TC_SA_0068`'s own root cause: its `page.expect_download(timeout=8000)`
 * waited only 8s, but the real export takes ~2-5 minutes server-side
 * (confirmed by the user manually), so the wait always timed out and fell
 * into a silent `except` that passed the test without ever checking a
 * download happened -- fixed in curatal_tests commit d0f773c (timeout
 * raised to 360000ms, the swallow removed so a real failure now fails
 * loudly). Separately, both tests were also blocked by a staging-side
 * issue -- the Scheduling Admin dashboard's own sidebar failed to render
 * the Netting link at all, showing a "Something Went Wrong. Please Try
 * Again" banner instead, so neither test could even navigate past its
 * first step. The user fixed that on staging directly (2026-08-27); both
 * tests confirmed passing live afterward via a scoped rerun of each.
 *
 * `TC_MR_006_Shortlist_Candidate` (tests/roles/cod/master_recruiter/
 * test_shortlist_candidate.py) confirmed hung live on 2026-08-20 -- two
 * separate real runs both stalled at exactly this point (right after the
 * module-scoped `masterrecruiter_page` fixture's first-use login for this
 * file), 15+ minutes with zero output, well past pytest.ini's own
 * `--timeout=600` (default "signal" method). curatal_tests briefly tried
 * `--timeout-method=thread` (PR #21) to make that timeout actually fire --
 * confirmed live it DID fire this time (on a different test, see below),
 * but interrupting Playwright's sync API mid-call (greenlet-based) crashed
 * the whole pytest process instead of just failing that one test, losing
 * batch 1's results anyway, just faster. Reverted (PR #22); quarantining
 * specific known-hangs here is the actual mitigation, not the timeout
 * method.
 *
 * `TC_MR_005_Shortlist_Specific_Candidate` (tests/roles/cod/
 * master_recruiter/test_mr_shortlist_specific_candidate.py) -- confirmed
 * hung live on 2026-08-20 in the SAME `ensure_recruiter_dashboard` /
 * dashboard-navigation retry path as TC_MR_006 above, despite this exact
 * test completing cleanly (XFAIL) in two earlier runs. Looks like a real,
 * intermittent staging-side flakiness in master-recruiter dashboard
 * loading rather than a deterministic code bug -- quarantined defensively
 * since a single bad run costs the whole batch.
 */
const QUARANTINED_BATCH1_TESTS = [
  'tests/roles/cod/master_recruiter/test_shortlist_candidate.py::test_TC_MR_006_Shortlist_Candidate',
  'tests/roles/cod/master_recruiter/test_mr_shortlist_specific_candidate.py::test_TC_MR_005_Shortlist_Specific_Candidate',
];

/**
 * Env-var escape hatch (not a source constant like `RUN_PANELADMIN_BATCH`)
 * so batch 1 can be skipped for a single run — e.g. re-running just batch 2
 * against a fresh deselect list right after a batch 1 that already
 * completed under the old code — without a redeploy. Unset/anything else
 * means both batches run as normal.
 */
const SKIP_BATCH_1 = process.env.STAGING_SKIP_BATCH_1 === 'true';

/**
 * Isolated-dev-run escape hatch, for testing a brand new test file/branch
 * without either merging it to main (which batch 1's blanket `tests`
 * collection would immediately sweep into every future run — there's no
 * allowlist, just an ignore of test_paneladmin.py) or waiting through the
 * full ~2h batch 1. When set, `STAGING_ONLY_PATH` replaces the normal
 * batch1/batch2 split entirely with a single ad hoc batch targeting just
 * that path (space-separated pytest args, e.g. one test file), against
 * whatever `STAGING_TEST_BRANCH` names (defaults to the repo's normal
 * default branch if unset). Both unset (the normal case) behaves exactly
 * as before this existed.
 */
const ONLY_PATH = process.env.STAGING_ONLY_PATH?.trim() || undefined;
const TEST_BRANCH = process.env.STAGING_TEST_BRANCH?.trim() || undefined;

function pythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: STAGING_PLAYWRIGHT_BROWSERS_PATH,
    // Confirmed live in production (docs/adr/0044): Python fully
    // block-buffers stdout whenever it isn't attached to a real terminal —
    // exactly this case, piped through xvfb-run into this process. Real
    // per-test `-v` output sat unflushed for 2.5+ hours of a genuinely
    // still-running suite, making the live progress/log-streaming fix
    // useless for exactly the case it exists to handle. This forces every
    // write to flush immediately.
    PYTHONUNBUFFERED: '1',
  };
}

/**
 * pytest's own default `-v` output already prints a right-aligned running
 * percentage on every test outcome line, e.g.
 * `tests/test_foo.py::test_bar PASSED  [ 12%]` — no extra flag needed.
 */
const PYTEST_PERCENT_PATTERN = /\[\s*(\d{1,3})%\]/;

/**
 * Line-buffers stdout chunks (a percent marker can land split across two
 * separate `data` events) and reports a new percent only when it actually
 * changes, since the same value repeats across every line of a given
 * test's output (docs/adr/0044).
 */
export function makePercentTracker(onProgress: (percent: number) => void): (chunk: string) => void {
  let buffer = '';
  let lastPercent: number | undefined;
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const match = PYTEST_PERCENT_PATTERN.exec(line);
      if (!match?.[1]) continue;
      const percent = Number(match[1]);
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress(percent);
      }
    }
  };
}

export interface PytestStagingTestRunnerOptions {
  /** The shared, externally-maintained repo (e.g. https://github.com/codewithVsingh/curatal_tests). */
  repoUrl: string;
  /**
   * Optional token embedded into the clone URL as the username (GitHub
   * accepts a PAT this way with no password). Needed even for a public
   * repo when cloning anonymously from a cloud/datacenter egress IP —
   * GitHub can demand auth there once its anonymous-clone rate limit is
   * hit, which otherwise fails with "could not read Username" (no TTY to
   * prompt on). No special scopes needed, just an authenticated identity.
   */
  gitToken?: string;
  pythonCommand?: string;
  gitCommand?: string;
  /**
   * The suite's own config.py hardcodes HEADLESS = False (its maintainers
   * run it locally with a real display) — this repo has no way to change
   * that without editing their file, which conflicts with always running
   * their latest, unmodified version. `xvfb-run` gives the "headed"
   * browser a virtual display to open instead, exactly as Playwright's own
   * error message recommends when a headed launch has no XServer.
   */
  xvfbCommand?: string;
}

/**
 * Runs the external, independently-maintained pytest/playwright-python
 * staging suite as a real subprocess (docs/adr/0036) — a genuinely
 * different tech stack from this repo's own TS Playwright tests, so
 * it's run as-is rather than reimplemented. Per the user, all test
 * cases (including what used to live on a separate `cod-automation`
 * branch, docs/adr/0039 — now superseded) have moved under `main`'s
 * `tests/` folder, split into per-persona subfolders, so a single clone
 * of `main` covers everything. The clone is fresh on every run (never a
 * frozen snapshot, since other people keep updating it), and installs
 * its own requirements + browser before running `pytest ... --junitxml`
 * so results can be parsed back into StagingTestResult rows.
 * Re-running `playwright install` after `pip install` matters
 * specifically because the repo's own `requirements.txt` can bump the
 * `playwright` package version at any time — the installed browser
 * build has to track whatever version pip just installed, not whatever
 * was baked into the image at build time.
 */
export class PytestStagingTestRunner implements StagingTestRunner {
  constructor(private readonly options: PytestStagingTestRunnerOptions) {}

  /** Never logged/thrown anywhere — git's own clone progress output doesn't echo the source URL, so the token never appears in stdout/stderr either. */
  private cloneUrl(): string {
    if (!this.options.gitToken) return this.options.repoUrl;
    const url = new URL(this.options.repoUrl);
    url.username = this.options.gitToken;
    return url.toString();
  }

  /**
   * A real, clickable GitHub URL for where the suite's tests live. `.git`
   * is stripped so the result is a normal browsable
   * `https://github.com/.../tree/...` link, not a clone URL.
   */
  private sourceUrl(): string {
    const base = this.options.repoUrl.replace(/\.git$/, '');
    return `${base}/tree/main/tests`;
  }

  async run(
    onProgress?: (percent: number) => void,
    onlyTestNames?: string[],
  ): Promise<StagingTestRunResult> {
    return { results: await this.runSuite(onProgress, onlyTestNames) };
  }

  /**
   * Recursively lists every `.py` file under `dir` -- the local
   * replacement for git grep's old pathspec (tests/*.py, tests/star-star/*.py),
   * see `resolveOnlyTestNames` below for why this is done via a plain
   * filesystem walk rather than shelling out to git.
   *
   * Confirmed live (2026-08-20): `readdir` on a subdirectory of this same
   * run's own fresh clone threw ENOENT mid-walk -- something in this
   * container transiently disturbs the temp tree the same way it earlier
   * disturbed the git binary itself (see resolveOnlyTestNames's doc
   * comment). Previously uncaught, this crashed the entire process rather
   * than just failing this one lookup. A directory that can't be read
   * contributes zero files rather than aborting the whole walk -- the
   * caller already treats a name with zero matches as "unresolved", the
   * same outcome as a genuinely renamed/removed test.
   */
  private async listPyFiles(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.error(
        `[staging] could not read "${dir}" while resolving test names: ${(error as Error).message}`,
      );
      return [];
    }
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listPyFiles(full)));
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        files.push(full);
      }
    }
    return files;
  }

  /**
   * Resolves bare test function names (e.g.
   * "test_TC_ADMIN_008_search_filter_users", no `[chromium]` suffix, no
   * file/class path) to real pytest node IDs against this run's own
   * fresh clone -- the "rerun failed/skipped tests" feature. Can't be
   * done from the stored JUnit `classname` alone (dots collapse the
   * path separator, `.py`, and package boundaries into one ambiguous
   * string), so this does what a human would: search for the `def`,
   * then walk upward for the nearest enclosing `class` at a shallower
   * indent. A name matching zero or more than one `def` (renamed,
   * removed, or otherwise ambiguous since the source run) is dropped
   * with a logged reason rather than guessed at.
   *
   * Confirmed live (2026-08-20) this used to shell out to `git grep`
   * instead: a bare `git` command that worked for the clone above went
   * on to fail with ENOENT for the rest of that container's lifetime.
   * Resolving git's absolute path via `which` right after the clone
   * (tried first) did NOT fix it either -- the git *binary itself* was
   * gone from disk by the time this ran (even `/usr/bin/git` resolved by
   * `which` moments earlier came back ENOENT), most likely removed as a
   * side effect of the `playwright install --with-deps` apt-get run that
   * happens between the clone and here. Since the repo is already cloned
   * to local disk at this point, there was never an actual need for git
   * here at all -- a plain recursive file read+regex search over
   * `repoDir/tests` does the same job without depending on git surviving
   * past the initial clone.
   */
  private async resolveOnlyTestNames(repoDir: string, names: string[]): Promise<string[]> {
    const testsDir = path.join(repoDir, 'tests');
    const pyFiles = await this.listPyFiles(testsDir);
    const nodeIds: string[] = [];
    const unresolved: string[] = [];
    for (const name of names) {
      const defPattern = new RegExp(`\\bdef ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(`);
      const matches: { filePath: string; lineNo: number }[] = [];
      for (const file of pyFiles) {
        let content: string;
        try {
          content = await readFile(file, 'utf-8');
        } catch {
          continue;
        }
        const fileLines = content.split('\n');
        for (let i = 0; i < fileLines.length; i += 1) {
          if (defPattern.test(fileLines[i]!)) {
            matches.push({
              filePath: path.relative(repoDir, file).replace(/\\/g, '/'),
              lineNo: i + 1,
            });
          }
        }
      }
      if (matches.length !== 1) {
        unresolved.push(name);
        continue;
      }
      const { filePath, lineNo } = matches[0]!;
      let source: string;
      try {
        source = await readFile(path.join(repoDir, filePath), 'utf-8');
      } catch {
        unresolved.push(name);
        continue;
      }
      const srcLines = source.split('\n');
      const defLine = srcLines[lineNo - 1] ?? '';
      const defIndent = defLine.length - defLine.trimStart().length;
      let className: string | undefined;
      for (let i = lineNo - 2; i >= 0; i -= 1) {
        const line = srcLines[i] ?? '';
        const stripped = line.trimStart();
        const indent = line.length - stripped.length;
        if (stripped.startsWith('class ') && indent < defIndent) {
          className = stripped.slice('class '.length).split('(')[0]!.split(':')[0]!.trim();
          break;
        }
      }
      nodeIds.push(className ? `${filePath}::${className}::${name}` : `${filePath}::${name}`);
    }
    if (unresolved.length > 0) {
      console.error(
        `[staging] could not resolve ${unresolved.length} test name(s) to a unique current ` +
          `source location (renamed, removed, or ambiguous since the original run) -- skipped: ` +
          unresolved.join(', '),
      );
    }
    return nodeIds;
  }

  /**
   * One full clone -> install -> browser -> pytest batch(es) -> parse
   * cycle against `main`. Split into two independent batches (docs/adr/0053)
   * — everything except `test_paneladmin.py`, then `test_paneladmin.py`
   * alone — each with its own timeout ceiling and its own try/catch, so a
   * slow or hung stretch in one batch can no longer eat into the other
   * batch's time budget or destroy its already-collected results. A batch
   * that fails outright (timeout, crash, no report produced) is logged and
   * skipped rather than aborting the whole run.
   *
   * Batch 2 also deselects the six specific tests identified by static
   * analysis as hang-prone (`QUARANTINED_PANELADMIN_TESTS`, docs/adr/0055)
   * rather than skipping the whole file — the other ~101 tests in
   * `test_paneladmin.py` still run as part of batch 2. `RUN_PANELADMIN_BATCH`
   * remains available as an escape hatch to drop batch 2 entirely (in which
   * case batch 1's progress maps to the full 0-100% range instead of the
   * 0-79% split used when both batches run).
   */
  private async runSuite(
    onProgress?: (percent: number) => void,
    onlyTestNames?: string[],
  ): Promise<StagingTestResult[]> {
    const workDir = await mkdtemp(path.join(tmpdir(), 'cqp-staging-tests-'));
    const repoDir = path.join(workDir, 'repo');
    const python = this.options.pythonCommand ?? 'python3';
    // Live-forwarded to this process's own stdout/stderr for every step
    // (docs/adr/0044) — a run silently buffered until the very end was
    // indistinguishable from a hung one when it legitimately took hours.
    const onStdout = (chunk: string): void => {
      process.stdout.write(chunk);
    };
    const onStderr = (chunk: string): void => {
      process.stderr.write(chunk);
    };

    try {
      requireZeroExit(
        'git clone',
        await runSubprocess(
          this.options.gitCommand ?? 'git',
          [
            'clone',
            '--depth',
            '1',
            ...(TEST_BRANCH ? ['--branch', TEST_BRANCH] : []),
            this.cloneUrl(),
            repoDir,
          ],
          { cwd: workDir, envVarName: 'STAGING_TESTS_GIT_PATH', onStdout, onStderr },
        ),
      );

      // "Rerun failed/skipped tests" name resolution happens here,
      // immediately after the clone, deliberately BEFORE pip/apt-get
      // below -- confirmed live (2026-08-20) across four separate rerun
      // attempts that ENOENT errors reading this same fresh clone (the
      // git binary itself, a batch1 subdirectory, then two unrelated
      // tests/ subdirectories) only ever showed up AFTER the pip install
      // + `playwright install --with-deps` apt-get burst below, never
      // before it. Resolution only needs the files this clone already
      // has on disk -- it has no actual dependency on pip/playwright
      // being installed -- so running it on a quiet filesystem before
      // that heavy I/O burst avoids whatever in this container's storage
      // that burst is disturbing, rather than working around each fresh
      // symptom of it after the fact.
      const resolvedOnlyTestNodeIds =
        onlyTestNames && onlyTestNames.length > 0
          ? await this.resolveOnlyTestNames(repoDir, onlyTestNames)
          : undefined;
      if (resolvedOnlyTestNodeIds && resolvedOnlyTestNodeIds.length === 0) {
        throw new Error(
          `None of the ${onlyTestNames!.length} requested test name(s) could be resolved to a current source location.`,
        );
      }

      requireZeroExit(
        'pip install -r requirements.txt',
        await runSubprocess(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
          onStdout,
          onStderr,
        }),
      );
      // The suite's own config imports python-dotenv, but its own
      // requirements.txt doesn't always list it — installed defensively
      // here so a gap in their file (which this repo doesn't control) never
      // silently breaks every single test with an import error.
      requireZeroExit(
        'pip install python-dotenv',
        await runSubprocess(python, ['-m', 'pip', 'install', 'python-dotenv'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
          onStdout,
          onStderr,
        }),
      );
      requireZeroExit(
        'playwright install chromium',
        await runSubprocess(python, ['-m', 'playwright', 'install', '--with-deps', 'chromium'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
          env: pythonEnv(),
          onStdout,
          onStderr,
        }),
      );

      const sourceUrl = this.sourceUrl();
      const results: StagingTestResult[] = [];

      // "Rerun failed/skipped tests" (UI-triggered, job-data-scoped, not
      // an env var like ONLY_PATH below) — takes priority over ONLY_PATH
      // if both were somehow set. Names were already resolved to node IDs
      // above, before the pip/apt-get burst -- see that comment.
      if (resolvedOnlyTestNodeIds) {
        console.error(
          `[staging] rerun request -- resolved ${resolvedOnlyTestNodeIds.length}/${onlyTestNames!.length} test name(s), skipping the normal batch1/batch2 split.`,
        );
        const rerunResults = await this.runBatch(
          python,
          repoDir,
          path.join(workDir, 'report-rerun.xml'),
          path.join(workDir, 'report-rerun.jsonl'),
          resolvedOnlyTestNodeIds,
          sourceUrl,
          onStdout,
          onStderr,
          onProgress,
        );
        if (rerunResults.length === 0) {
          throw new Error('Staging test batch(es) failed to produce any results.');
        }
        return rerunResults;
      }

      // Isolated dev run: STAGING_ONLY_PATH bypasses the normal
      // batch1/batch2 split entirely and just runs that one path,
      // owning the full 0-100% progress range. No quarantine-list
      // deselects or synthesized skip rows -- those only apply to the
      // real batch 2.
      if (ONLY_PATH) {
        console.error(
          `[staging] STAGING_ONLY_PATH set -- running only "${ONLY_PATH}"` +
            (TEST_BRANCH ? ` on branch "${TEST_BRANCH}"` : '') +
            ', skipping the normal batch1/batch2 split.',
        );
        const onlyBatch = await this.runBatch(
          python,
          repoDir,
          path.join(workDir, 'report-only.xml'),
          path.join(workDir, 'report-only.jsonl'),
          ONLY_PATH.split(/\s+/),
          sourceUrl,
          onStdout,
          onStderr,
          onProgress,
        );
        results.push(...onlyBatch);

        if (results.length === 0) {
          throw new Error('Staging test batch(es) failed to produce any results.');
        }
        return results;
      }

      // Both batches run -> 79/21 split. Only one runs (batch 2 disabled,
      // or batch 1 skipped via STAGING_SKIP_BATCH_1) -> that one owns the
      // full 0-100% range.
      const bothBatchesRun = RUN_PANELADMIN_BATCH && !SKIP_BATCH_1;
      const batch1Weight = bothBatchesRun ? 0.79 : 1;

      // Batch 1: everything except test_paneladmin.py (~79% of tests, or
      // effectively the whole suite while batch 2 is disabled). Skipped
      // entirely when STAGING_SKIP_BATCH_1=true (e.g. re-running just batch
      // 2 right after a batch 1 that already completed).
      if (!SKIP_BATCH_1) {
        try {
          const batch1 = await this.runBatch(
            python,
            repoDir,
            path.join(workDir, 'report-1.xml'),
            path.join(workDir, 'report-1.jsonl'),
            [
              'tests',
              `--ignore=${PANELADMIN_FILE}`,
              ...QUARANTINED_BATCH1_TESTS.map((id) => `--deselect=${id}`),
            ],
            sourceUrl,
            onStdout,
            onStderr,
            onProgress ? (percent) => onProgress(Math.round(percent * batch1Weight)) : undefined,
          );
          results.push(...batch1);
        } catch (error) {
          // Reaching this catch means BOTH the JUnit and report-log fallback
          // (docs/adr/0057) inside runBatch came up empty — genuine total
          // loss for this batch, not the partial-recovery case (that returns
          // normally, logged separately inside runBatch itself).
          console.error(
            `[staging batch 1] failed with ZERO recoverable results (both JUnit and report-log unavailable): ${(error as Error).message}`,
          );
        }

        // Same "still show up in the report" rationale as the paneladmin
        // quarantine stubs below — pushed unconditionally, regardless of
        // whether batch 1 itself succeeded or threw.
        results.push(
          ...QUARANTINED_BATCH1_TESTS.map((id) => {
            const testName = id.split('::').pop() ?? id;
            return {
              testId: id,
              testName,
              passed: false,
              details:
                'SKIPPED: Deselected before this run -- known to hang (docs/adr/0055, docs/adr/0056). Not executed.',
              sourceUrl,
            };
          }),
        );
      } else {
        console.error('[staging batch 1] skipped (STAGING_SKIP_BATCH_1=true)');
      }

      // Batch 2: test_paneladmin.py (~21% of tests), minus the six
      // quarantined tests identified by static analysis as hang-prone
      // (docs/adr/0055) — deselected by exact node ID rather than
      // dropping the whole file, so the other ~101 tests in it still run.
      if (RUN_PANELADMIN_BATCH) {
        try {
          const batch2 = await this.runBatch(
            python,
            repoDir,
            path.join(workDir, 'report-2.xml'),
            path.join(workDir, 'report-2.jsonl'),
            [
              PANELADMIN_FILE,
              ...QUARANTINED_PANELADMIN_TESTS.map(
                (name) => `--deselect=${PANELADMIN_FILE}::TestPanelAdminLogin::${name}`,
              ),
            ],
            sourceUrl,
            onStdout,
            onStderr,
            bothBatchesRun
              ? onProgress
                ? (percent) => onProgress(79 + Math.round(percent * 0.21))
                : undefined
              : onProgress,
          );
          results.push(...batch2);
        } catch (error) {
          // See batch 1's catch above -- this only fires on genuine total
          // loss (both JUnit and report-log fallback empty), not a partial
          // recovery (which returns normally and is logged inside runBatch).
          console.error(
            `[staging batch 2] failed with ZERO recoverable results (both JUnit and report-log unavailable): ${(error as Error).message}`,
          );
        }

        // Per the user: the quarantined tests should still show up in the
        // report, not just vanish -- otherwise there's no record they were
        // ever excluded. Synthesized with the same `SKIPPED:` prefix the
        // JUnit parser stamps on a real pytest skip, so these fall into
        // the existing "Skipped tests" report section and the "possible
        // hang" flag (which just greps for "hang" in the details text)
        // picks them up automatically -- no reporting-layer changes needed.
        results.push(
          ...QUARANTINED_PANELADMIN_TESTS.map((name) => ({
            testId: `${PANELADMIN_FILE}::TestPanelAdminLogin::${name}`,
            testName: name,
            passed: false,
            details:
              'SKIPPED: Deselected before this run -- known to hang (docs/adr/0055, docs/adr/0056). Not executed.',
            sourceUrl,
          })),
        );
      }

      if (results.length === 0) {
        throw new Error('Staging test batch(es) failed to produce any results.');
      }
      return results;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async runBatch(
    python: string,
    repoDir: string,
    reportPath: string,
    reportLogPath: string,
    testPaths: string[],
    sourceUrl: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onProgress?: (percent: number) => void,
  ): Promise<StagingTestResult[]> {
    const outcome = await this.runPytest(
      python,
      repoDir,
      reportPath,
      reportLogPath,
      testPaths,
      onStdout,
      onStderr,
      onProgress,
    );

    // Primary path — unchanged from before this existed: on a clean pytest
    // exit, the JUnit report is always the source of truth.
    const xml = await readFile(reportPath, 'utf-8').catch(() => undefined);
    if (xml !== undefined) {
      return parseJunitXml(xml).map((result) => ({ ...result, sourceUrl }));
    }

    // Fallback path (docs/adr/0057) — JUnit was never written, because
    // pytest's session never exited normally (SIGKILL-on-hang, docs/adr/0045,
    // or a crash before teardown). Recover whatever pytest-reportlog managed
    // to flush to disk before the process ended, instead of losing every
    // already-completed result in the batch along with the one that hung.
    const reportLog = await readFile(reportLogPath, 'utf-8').catch(() => undefined);
    const recovered = reportLog ? parseReportLog(reportLog) : [];

    if (recovered.length > 0) {
      console.error(
        `[staging] pytest report at ${reportPath} was never written (exit code ${outcome.exitCode}, timed out: ${outcome.timedOut}) -- ` +
          `recovered ${recovered.length} result(s) from the report-log fallback (${reportLogPath}, docs/adr/0057). ` +
          'Any test still in-flight when the process ended has no recorded outcome and is not included in this count.',
      );
      return recovered.map((result) => ({
        ...result,
        sourceUrl,
        details: markRecovered(result.details),
      }));
    }

    throw new Error(
      `pytest produced no usable report at ${reportPath} or ${reportLogPath} for ${testPaths.join(' ')} ` +
        `(exit code ${outcome.exitCode}, timed out: ${outcome.timedOut}).\n` +
        `stderr (tail): ${outcome.stderr.trim().slice(-2000)}\nstdout (tail): ${outcome.stdout.trim().slice(-2000)}`,
    );
  }

  /**
   * pytest exits non-zero whenever any test fails — that's expected, not a
   * runner failure; the real per-test outcomes live in the JUnit XML this
   * call produces, not in the exit code. But if it failed to even start
   * (e.g. a bad CLI flag), no XML is produced at all — that case still
   * needs to surface the real stderr, not the opaque ENOENT from the read
   * in `runBatch`.
   *
   * `--continue-on-collection-errors` is load-bearing, confirmed via a
   * real reproduction: pytest's default behavior is to abort the *entire*
   * session the moment any single file fails to import (e.g. one test
   * module referencing a persona key missing from this
   * externally-maintained repo's own config) — "Interrupted: 1 error
   * during collection", zero of the other (hundreds of) tests ever run.
   * Since this suite is independently maintained and kept fresh on every
   * run, one broken file is expected to happen periodically; without this
   * flag a single bad file silently discards the entire real run every
   * time, which is exactly what was happening.
   *
   * `timeoutMs` (docs/adr/0045) is separately load-bearing — two real
   * runs each hung for hours with zero output at the same point, and
   * nothing else in this stack can recover from a genuinely stuck child
   * process. A timeout no longer propagates as a thrown error past this
   * method (docs/adr/0057) — it's returned as just another way the
   * subprocess concluded (`timedOut: true`), so `runBatch`'s
   * JUnit-then-report-log fallback chain handles a clean exit, a crash, and
   * a hang-kill uniformly instead of a hang-kill skipping past it entirely.
   * A genuine spawn failure (e.g. `xvfb-run` itself missing) still throws —
   * no report of any kind could ever help with that.
   */
  private async runPytest(
    python: string,
    repoDir: string,
    reportPath: string,
    reportLogPath: string,
    testPaths: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onProgress?: (percent: number) => void,
  ): Promise<SubprocessResult & { timedOut: boolean }> {
    const percentTracker = onProgress ? makePercentTracker(onProgress) : undefined;
    try {
      const result = await runSubprocess(
        this.options.xvfbCommand ?? 'xvfb-run',
        [
          '-a',
          python,
          '-m',
          'pytest',
          ...testPaths,
          '-v',
          '--browser',
          'chromium',
          '--continue-on-collection-errors',
          `--junitxml=${reportPath}`,
          `--report-log=${reportLogPath}`,
        ],
        {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_XVFB_PATH',
          env: pythonEnv(),
          onStdout: (chunk) => {
            onStdout(chunk);
            percentTracker?.(chunk);
          },
          onStderr,
          timeoutMs: MAX_PYTEST_DURATION_MS,
        },
      );
      return { ...result, timedOut: false };
    } catch (error) {
      if (error instanceof SubprocessTimeoutError) {
        return { exitCode: null, stdout: error.stdout, stderr: error.stderr, timedOut: true };
      }
      throw error;
    }
  }
}
