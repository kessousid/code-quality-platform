import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult } from '@cqp/core';
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

export interface PytestStagingTestRunnerOptions {
  /** The shared, externally-maintained repo (e.g. https://github.com/codewithVsingh/curatal_tests). */
  repoUrl: string;
  pythonCommand?: string;
  gitCommand?: string;
}

/**
 * Runs the external, independently-maintained pytest/playwright-python
 * staging suite as a real subprocess (docs/adr/0036) — a genuinely
 * different tech stack from this repo's own TS Playwright tests, so it's
 * run as-is rather than reimplemented. Shallow-clones the repo fresh on
 * every run (never a frozen snapshot, since other people keep updating
 * it), installs its own requirements, then runs the whole suite with
 * `--junitxml` so results can be parsed back into StagingTestResult rows.
 * Re-running `playwright install` after each fresh `pip install` matters
 * here specifically because the repo's own `requirements.txt` can bump the
 * `playwright` package version at any time — the installed browser build
 * has to track whatever version pip just installed, not whatever was
 * baked into the image at build time.
 */
export class PytestStagingTestRunner implements StagingTestRunner {
  constructor(private readonly options: PytestStagingTestRunnerOptions) {}

  async run(): Promise<StagingTestRunResult> {
    const workDir = await mkdtemp(path.join(tmpdir(), 'cqp-staging-tests-'));
    const repoDir = path.join(workDir, 'repo');
    const reportPath = path.join(workDir, 'report.xml');
    const python = this.options.pythonCommand ?? 'python3';

    try {
      requireZeroExit(
        'git clone',
        await runSubprocess(
          this.options.gitCommand ?? 'git',
          ['clone', '--depth', '1', this.options.repoUrl, repoDir],
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
      requireZeroExit(
        'playwright install chromium',
        await runSubprocess(python, ['-m', 'playwright', 'install', '--with-deps', 'chromium'], {
          cwd: repoDir,
          envVarName: 'STAGING_TESTS_PYTHON_PATH',
        }),
      );

      // pytest exits non-zero whenever any test fails — that's expected,
      // not a runner failure; the real per-test outcomes live in the
      // JUnit XML this call produces, not in the exit code. But if it
      // failed to even start (e.g. a bad CLI flag), no XML is produced at
      // all — that case still needs to surface the real stderr, not the
      // opaque ENOENT from the read below.
      const pytestResult = await runSubprocess(
        python,
        ['-m', 'pytest', 'tests', '-v', '--browser', 'chromium', `--junitxml=${reportPath}`],
        { cwd: repoDir, envVarName: 'STAGING_TESTS_PYTHON_PATH' },
      );

      const xml = await readFile(reportPath, 'utf-8').catch(() => {
        throw new Error(
          `pytest produced no report at ${reportPath} (exit code ${pytestResult.exitCode}).\nstderr: ${pytestResult.stderr.trim()}\nstdout: ${pytestResult.stdout.trim()}`,
        );
      });
      return { results: parseJunitXml(xml) };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
