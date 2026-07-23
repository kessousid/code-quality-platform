import type { GeneratedTestFile, TestCaseResult, UnitTestRun } from '@cqp/core';

/** Mirrors report-model.ts exactly (docs/adr/0019), for UnitTestRun instead of Scan — see docs/adr/0024's follow-up. */
export interface UnitTestReportModel {
  run: Pick<
    UnitTestRun,
    'id' | 'target' | 'status' | 'testsTotal' | 'testsPassed' | 'testsFailed' | 'completedAt'
  >;
  generatedFiles: GeneratedTestFile[];
  results: TestCaseResult[];
  generatedAt: Date;
}

export function buildUnitTestReportModel(
  run: UnitTestRun,
  generatedFiles: GeneratedTestFile[],
  results: TestCaseResult[],
): UnitTestReportModel {
  return {
    run: {
      id: run.id,
      target: run.target,
      status: run.status,
      ...(run.testsTotal !== undefined ? { testsTotal: run.testsTotal } : {}),
      ...(run.testsPassed !== undefined ? { testsPassed: run.testsPassed } : {}),
      ...(run.testsFailed !== undefined ? { testsFailed: run.testsFailed } : {}),
      ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    },
    generatedFiles,
    results,
    generatedAt: new Date(),
  };
}
