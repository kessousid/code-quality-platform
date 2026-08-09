import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult, StagingTestResult } from '@cqp/core';
import { runSubprocess, type SubprocessResult } from '@cqp/plugin-shared';
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

function pythonEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PLAYWRIGHT_BROWSERS_PATH: STAGING_PLAYWRIGHT_BROWSERS_PATH };
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

  /** One full clone -> install -> browser -> pytest -> parse cycle against `main`. */
  private async runSuite(onProgress?: (percent: number) => void): Promise<StagingTestResult[]> {
    const workDir = await mkdtemp(path.join(tmpdir(), 'cqp-staging-tests-'));
    const repoDir = path.join(workDir, 'repo');
    const reportPath = path.join(workDir, 'report.xml');
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

      // pytest exits non-zero whenever any test fails — that's expected,
      // not a runner failure; the real per-test outcomes live in the
      // JUnit XML this call produces, not in the exit code. But if it
      // failed to even start (e.g. a bad CLI flag), no XML is produced at
      // all — that case still needs to surface the real stderr, not the
      // opaque ENOENT from the read below.
      //
      // `--continue-on-collection-errors` is load-bearing, confirmed via a
      // real reproduction: pytest's default behavior is to abort the
      // *entire* session the moment any single file fails to import (e.g.
      // one test module referencing a persona key missing from this
      // externally-maintained repo's own config) — "Interrupted: 1 error
      // during collection", zero of the other (hundreds of) tests ever
      // run. Since this suite is independently maintained and kept fresh
      // on every run, one broken file is expected to happen periodically;
      // without this flag a single bad file silently discards the entire
      // real run every time, which is exactly what was happening.
      const percentTracker = onProgress ? makePercentTracker(onProgress) : undefined;
      const pytestResult = await runSubprocess(
        this.options.xvfbCommand ?? 'xvfb-run',
        [
          '-a',
          python,
          '-m',
          'pytest',
          'tests',
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
        },
      );

      const xml = await readFile(reportPath, 'utf-8').catch(() => {
        throw new Error(
          `pytest produced no report at ${reportPath} (exit code ${pytestResult.exitCode}).\nstderr: ${pytestResult.stderr.trim()}\nstdout: ${pytestResult.stdout.trim()}`,
        );
      });
      const sourceUrl = this.sourceUrl();
      return parseJunitXml(xml).map((result) => ({ ...result, sourceUrl }));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
