import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult, StagingTestResult } from '@cqp/core';
import { runSubprocess, type SubprocessResult } from '@cqp/plugin-shared';
import { parseJunitXml } from './junit-xml-parser.js';

/**
 * Per the user: COD (Candidate on Demand) automation now lives on its own
 * branch of the same repo, actively maintained separately from `main` —
 * `main`'s own `tests/roles/cod` is excluded here so COD coverage isn't
 * run (and, if the two ever drift, double-counted) from two places at
 * once. This branch has its own committed `.env` (same mechanism as
 * `main`'s — see `config.py`'s `load_dotenv()` with no path argument,
 * which reads whatever `.env` sits in the process's cwd, i.e. wherever
 * *that* branch's clone lands) and its own `pytest.ini` `cod` marker,
 * which is what actually scopes the run to COD tests specifically —
 * this branch also carries a broader, work-in-progress admin/auth/RBAC
 * suite that isn't COD at all.
 */
const COD_AUTOMATION_BRANCH = 'cod-automation';

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
 * staging suite as a real subprocess (docs/adr/0036, docs/adr/0039) — a
 * genuinely different tech stack from this repo's own TS Playwright
 * tests, so it's run as-is rather than reimplemented. Two separate
 * clones run in sequence and their results are concatenated: `main`
 * (minus its own `tests/roles/cod`) and the dedicated `cod-automation`
 * branch (scoped to just its `cod`-marked tests) — see docs/adr/0039 for
 * why COD moved to its own branch. Each clone is fresh on every run
 * (never a frozen snapshot, since other people keep updating both), and
 * each installs its own requirements + browser before running its own
 * `pytest ... --junitxml` so results can be parsed back into
 * StagingTestResult rows. Re-running `playwright install` after each
 * fresh `pip install` matters specifically because either branch's own
 * `requirements.txt` can bump the `playwright` package version at any
 * time — the installed browser build has to track whatever version pip
 * just installed, not whatever was baked into the image at build time.
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
   * A real, clickable GitHub URL for wherever a given result's tests
   * actually live — per the user, there was no way to tell from the
   * report whether tests from `main` or from `cod-automation` (docs/adr/0039)
   * had actually run. `.git` is stripped so the result is a normal
   * browsable `https://github.com/.../tree/...` link, not a clone URL.
   */
  private sourceUrlFor(branch: string | undefined): string {
    const base = this.options.repoUrl.replace(/\.git$/, '');
    return branch !== undefined ? `${base}/tree/${branch}` : `${base}/tree/main/tests`;
  }

  async run(): Promise<StagingTestRunResult> {
    const mainResults = await this.runSuite(undefined, ['tests', '--ignore=tests/roles/cod']);
    const codResults = await this.runSuite(COD_AUTOMATION_BRANCH, ['tests', '-m', 'cod']);
    return { results: [...mainResults, ...codResults] };
  }

  /**
   * One full clone -> install -> browser -> pytest -> parse cycle,
   * against either `main` (branch === undefined, git's own default) or a
   * named branch. `pytestArgs` follow `pytest` on the command line, ahead
   * of the flags every run always needs (`-v --browser chromium
   * --junitxml=...`).
   */
  private async runSuite(
    branch: string | undefined,
    pytestArgs: string[],
  ): Promise<StagingTestResult[]> {
    const workDir = await mkdtemp(path.join(tmpdir(), 'cqp-staging-tests-'));
    const repoDir = path.join(workDir, 'repo');
    const reportPath = path.join(workDir, 'report.xml');
    const python = this.options.pythonCommand ?? 'python3';

    try {
      requireZeroExit(
        'git clone',
        await runSubprocess(
          this.options.gitCommand ?? 'git',
          [
            'clone',
            '--depth',
            '1',
            ...(branch !== undefined ? ['-b', branch] : []),
            this.cloneUrl(),
            repoDir,
          ],
          { cwd: workDir, envVarName: 'STAGING_TESTS_GIT_PATH' },
        ),
      );

      requireZeroExit(
        'pip install -r requirements.txt',
        await runSubprocess(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
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
        }),
      );
      requireZeroExit(
        'playwright install chromium',
        await runSubprocess(python, ['-m', 'playwright', 'install', '--with-deps', 'chromium'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
          env: pythonEnv(),
        }),
      );

      // pytest exits non-zero whenever any test fails — that's expected,
      // not a runner failure; the real per-test outcomes live in the
      // JUnit XML this call produces, not in the exit code. But if it
      // failed to even start (e.g. a bad CLI flag), no XML is produced at
      // all — that case still needs to surface the real stderr, not the
      // opaque ENOENT from the read below.
      const pytestResult = await runSubprocess(
        this.options.xvfbCommand ?? 'xvfb-run',
        [
          '-a',
          python,
          '-m',
          'pytest',
          ...pytestArgs,
          '-v',
          '--browser',
          'chromium',
          `--junitxml=${reportPath}`,
        ],
        { cwd: repoDir, envVarName: 'STAGING_TESTS_XVFB_PATH', env: pythonEnv() },
      );

      const xml = await readFile(reportPath, 'utf-8').catch(() => {
        throw new Error(
          `pytest produced no report at ${reportPath} (exit code ${pytestResult.exitCode}).\nstderr: ${pytestResult.stderr.trim()}\nstdout: ${pytestResult.stdout.trim()}`,
        );
      });
      const sourceUrl = this.sourceUrlFor(branch);
      return parseJunitXml(xml).map((result) => ({ ...result, sourceUrl }));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
