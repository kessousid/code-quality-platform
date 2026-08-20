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
   *
   * `onlyTestNames`, when given, scopes the whole run to just those bare
   * test function names (e.g. "test_TC_ADMIN_008_search_filter_users",
   * no `[chromium]` suffix, no file/class path) instead of the normal
   * full-suite batch split — the "rerun failed/skipped tests" feature.
   * Resolving a bare name to a real runnable target is an adapter
   * concern (the runner's own fresh clone is the only place that can
   * actually do it), not something this port dictates.
   */
  run(
    onProgress?: (percent: number) => void,
    onlyTestNames?: string[],
  ): Promise<StagingTestRunResult>;
}
