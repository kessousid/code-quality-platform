import type { StagingTestRunner, StagingTestRunResult } from '@cqp/core';

/** Configurable fake — never clones a repo or spawns pytest, unlike PytestStagingTestRunner. */
export class FakeStagingTestRunner implements StagingTestRunner {
  result: StagingTestRunResult = {
    results: [{ testId: 't1', testName: 'a staging test', passed: true, details: 'ok' }],
  };
  runCalls = 0;

  async run(): Promise<StagingTestRunResult> {
    this.runCalls += 1;
    return this.result;
  }
}
