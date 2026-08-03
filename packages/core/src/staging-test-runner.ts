/**
 * Port for executing the external staging test suite (docs/adr/0036) — a
 * real Python/pytest/playwright-python repo maintained in a separate,
 * shared GitHub repo, kept up to date independently of this codebase.
 * Mirrors EmailSender's port/adapter split: this package only knows the
 * shape of a result, not how the suite is actually run (subprocess, repo
 * clone, XML parsing — all adapter concerns, see @cqp/staging-test-runner).
 */
export interface StagingTestResult {
  testId: string;
  testName: string;
  passed: boolean;
  details: string;
}

export interface StagingTestRunResult {
  results: StagingTestResult[];
}

export interface StagingTestRunner {
  run(): Promise<StagingTestRunResult>;
}
