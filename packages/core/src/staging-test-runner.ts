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
  /**
   * A real, clickable link to where this test's source lives. Optional so
   * a runner with no natural single source (e.g. production, which has
   * only ever run from this repo's own TS test registry) is never forced
   * to fill this in.
   */
  sourceUrl?: string;
}

export interface StagingTestRunResult {
  results: StagingTestResult[];
}

export interface StagingTestRunner {
  /**
   * `onProgress` fires with 0-100 as the run progresses, whenever the
   * runner has a real way to measure it (docs/adr/0044) — optional since
   * not every runner necessarily can.
   */
  run(onProgress?: (percent: number) => void): Promise<StagingTestRunResult>;
}
