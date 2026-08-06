import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestCaseResult, TestGeneratorType, UnitTestTarget } from '@cqp/core';

export const EXECUTION_REPORT_DIR_NAME = 'execution report';
export const EXECUTION_REPORT_FILE_NAME = 'report.json';

export interface LocalExecutionReport {
  generator: TestGeneratorType;
  target: UnitTestTarget;
  generatedAt: string;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  testResults: Omit<TestCaseResult, 'id' | 'runId'>[];
}

/**
 * A local, worker-side convenience copy of this run's results (see
 * docs/adr/0038) — distinct from the PDF/Excel/HTML/JSON report the web
 * UI downloads, which is generated and stored only by apps/api into
 * object storage (docs/adr/0034, since that's the only machine that can
 * serve it back). This one lives right next to the generated tests on
 * whichever machine actually ran them, for a developer working directly
 * in the repo/IDE with no need to open the web UI at all.
 */
export async function writeLocalExecutionReport(
  targetOutputDir: string,
  report: LocalExecutionReport,
): Promise<void> {
  const dir = join(targetOutputDir, EXECUTION_REPORT_DIR_NAME);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, EXECUTION_REPORT_FILE_NAME), JSON.stringify(report, null, 2), 'utf-8');
}
