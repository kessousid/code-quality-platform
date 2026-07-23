/** See docs/adr/0024. Per-run child records: which test files got generated, and what each individual `it(...)` block did when Jest ran them. */

export type TestCaseStatus = 'passed' | 'failed' | 'skipped';

export interface GeneratedTestFile {
  id: string;
  runId: string;
  /** Relative to the repo's localPath. */
  sourceFilePath: string;
  /** Relative to the repo's localPath — always ends in `.generated.test.<ext>`, computed by the orchestrator, never trusted from the LLM's output. */
  testFilePath: string;
  functionName?: string;
  createdAt: Date;
}

export interface TestCaseResult {
  id: string;
  runId: string;
  testFilePath: string;
  testName: string;
  status: TestCaseStatus;
  durationMs?: number;
  failureMessage?: string;
}

export interface GeneratedTestFileRepository {
  saveMany(
    runId: string,
    files: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[],
  ): Promise<GeneratedTestFile[]>;
  listByRun(runId: string): Promise<GeneratedTestFile[]>;
}

export interface TestCaseResultRepository {
  saveMany(
    runId: string,
    results: Omit<TestCaseResult, 'id' | 'runId'>[],
  ): Promise<TestCaseResult[]>;
  listByRun(runId: string): Promise<TestCaseResult[]>;
}
