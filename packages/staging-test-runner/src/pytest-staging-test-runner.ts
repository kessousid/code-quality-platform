import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StagingTestRunner, StagingTestRunResult } from '@cqp/core';
import { runSubprocess } from '@cqp/plugin-shared';
import { parseJunitXml } from './junit-xml-parser.js';

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
      await runSubprocess(
        this.options.gitCommand ?? 'git',
        ['clone', '--depth', '1', this.options.repoUrl, repoDir],
        { cwd: workDir, envVarName: 'STAGING_TESTS_GIT_PATH' },
      );

      await runSubprocess(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
        cwd: repoDir,
        envVarName: 'STAGING_TESTS_PYTHON_PATH',
      });
      await runSubprocess(python, ['-m', 'playwright', 'install', '--with-deps', 'chromium'], {
        cwd: repoDir,
        envVarName: 'STAGING_TESTS_PYTHON_PATH',
      });

      // pytest exits non-zero whenever any test fails — that's expected,
      // not a runner failure; the real per-test outcomes live in the
      // JUnit XML this call produces, not in the exit code.
      await runSubprocess(
        python,
        ['-m', 'pytest', 'tests', '-v', '--browser', 'chromium', `--junitxml=${reportPath}`],
        { cwd: repoDir, envVarName: 'STAGING_TESTS_PYTHON_PATH' },
      );

      const xml = await readFile(reportPath, 'utf-8');
      return { results: parseJunitXml(xml) };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
