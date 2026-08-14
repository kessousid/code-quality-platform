import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult, StagingTestResult } from '@cqp/core';
import { runSubprocess, SubprocessTimeoutError, type SubprocessResult } from '@cqp/plugin-shared';
import { parseJunitXml } from './junit-xml-parser.js';

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
const PANELADMIN_FILE = 'tests/test_paneladmin.py';

/**
 * Batch 2 (`test_paneladmin.py`) is re-enabled (docs/adr/0055), minus the
 * specific tests below. The first six were found by a static, read-only
 * review (no execution) of two known hang-prone shapes: `TC_PANELADMIN_049`
 * is the confirmed live culprit (20-30+ min stuck on chained 30s-timeout
 * wizard-field fallbacks); `050`/`051`/`052` share that exact
 * Add-Interviewer-wizard scaffold and haven't been caught live yet only by
 * chance; `007`/`008` have a separate shape — nested pagination/retry loops
 * gated on live staging data with no upper bound if that data condition
 * never arrives.
 *
 * `053`-`059` were added later (docs/adr/0056) from a real live run and a
 * source-level trace, not static review: every one of these calls
 * Playwright's `page.expect_download(timeout=TIMEOUT)` (`TIMEOUT` = 30s,
 * config.py) waiting for a real browser download event. `053` stalled and
 * errored at the suite's own 600s per-test timeout — far longer than the
 * 30s the code's own try/except should allow, meaning the browser itself
 * gets wedged waiting on the download, not a clean timeout — and every
 * test after it that hits the same `expect_download` call did too, seven
 * in a row. `034` hits the identical `expect_download` call but has a
 * graceful fallback after it and fails fast (~90s) instead of hanging —
 * its own comment ("Case C: download (observed primary behavior on
 * staging)") confirms staging doesn't reliably fire download events at
 * all. No other test in the file calls `expect_download`, so the blast
 * radius stops at `059`. One shared root cause, not eight independent
 * bugs. The rest of the file (the other ~94 tests) showed no such
 * pattern and runs normally as part of batch 2.
 */
const RUN_PANELADMIN_BATCH = true;

const QUARANTINED_PANELADMIN_TESTS = [
  'test_TC_PANELADMIN_007_assign_recommended_interviewer',
  'test_TC_PANELADMIN_008_unassign_proposed_interviewer',
  // 048 shares 049-052's exact chained-wizard-fallback shape (same
  // Add-Interviewer scaffold) but was missed by ADR-0055's original
  // static review. Failed in all 3 live runs today at ~9m50s every
  // time -- never passes, just burns the time. docs/adr/0056.
  'test_TC_PANELADMIN_048_add_interviewer_banking_required_fields_validation',
  'test_TC_PANELADMIN_049_add_interviewer_account_number_mismatch_validation',
  'test_TC_PANELADMIN_050_add_interviewer_invalid_ifsc_and_pan_validation',
  'test_TC_PANELADMIN_051_add_interviewer_invalid_banking_document_upload',
  'test_TC_PANELADMIN_052_add_interviewer_successfully',
  'test_TC_PANELADMIN_053_download_basic_predefined_reports_as_excel',
  'test_TC_PANELADMIN_054_download_interviewers_payment_report_with_date_filter',
  'test_TC_PANELADMIN_055_download_uploaded_profiles_report_as_excel',
  'test_TC_PANELADMIN_056_uploaded_profiles_first_date_range_filter',
  'test_TC_PANELADMIN_057_uploaded_profiles_company_filter',
  'test_TC_PANELADMIN_058_uploaded_profiles_company_and_job_title_filter',
  'test_TC_PANELADMIN_059_uploaded_profiles_interview_status_filter',
];

/**
 * Env-var escape hatch (not a source constant like `RUN_PANELADMIN_BATCH`)
 * so batch 1 can be skipped for a single run — e.g. re-running just batch 2
 * against a fresh deselect list right after a batch 1 that already
 * completed under the old code — without a redeploy. Unset/anything else
 * means both batches run as normal.
 */
const SKIP_BATCH_1 = process.env.STAGING_SKIP_BATCH_1 === 'true';

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

  async run(onProgress?: (percent: number) => void): Promise<StagingTestRunResult> {
    return { results: await this.runSuite(onProgress) };
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
  private async runSuite(onProgress?: (percent: number) => void): Promise<StagingTestResult[]> {
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
          ['clone', '--depth', '1', this.cloneUrl(), repoDir],
          { cwd: workDir, envVarName: 'STAGING_TESTS_GIT_PATH', onStdout, onStderr },
        ),
      );

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
            ['tests', `--ignore=${PANELADMIN_FILE}`],
            sourceUrl,
            onStdout,
            onStderr,
            onProgress ? (percent) => onProgress(Math.round(percent * batch1Weight)) : undefined,
          );
          results.push(...batch1);
        } catch (error) {
          console.error(`[staging batch 1] failed: ${(error as Error).message}`);
        }
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
          console.error(`[staging batch 2] failed: ${(error as Error).message}`);
        }
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
    testPaths: string[],
    sourceUrl: string,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onProgress?: (percent: number) => void,
  ): Promise<StagingTestResult[]> {
    const pytestResult = await this.runPytest(
      python,
      repoDir,
      reportPath,
      testPaths,
      onStdout,
      onStderr,
      onProgress,
    );

    const xml = await readFile(reportPath, 'utf-8').catch(() => {
      throw new Error(
        `pytest produced no report at ${reportPath} for ${testPaths.join(' ')} (exit code ${pytestResult.exitCode}).\nstderr: ${pytestResult.stderr.trim()}\nstdout: ${pytestResult.stdout.trim()}`,
      );
    });
    return parseJunitXml(xml).map((result) => ({ ...result, sourceUrl }));
  }

  /**
   * pytest exits non-zero whenever any test fails — that's expected, not a
   * runner failure; the real per-test outcomes live in the JUnit XML this
   * call produces, not in the exit code. But if it failed to even start
   * (e.g. a bad CLI flag), no XML is produced at all — that case still
   * needs to surface the real stderr, not the opaque ENOENT from the read
   * in `runSuite`.
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
   * process.
   */
  private async runPytest(
    python: string,
    repoDir: string,
    reportPath: string,
    testPaths: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onProgress?: (percent: number) => void,
  ): Promise<SubprocessResult> {
    const percentTracker = onProgress ? makePercentTracker(onProgress) : undefined;
    try {
      return await runSubprocess(
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
    } catch (error) {
      if (error instanceof SubprocessTimeoutError) {
        throw new Error(
          `pytest (${testPaths.join(' ')}) ran longer than ${MAX_PYTEST_DURATION_MS / 60_000} minutes and was killed as hung — see docs/adr/0045.`,
        );
      }
      throw error;
    }
  }
}
