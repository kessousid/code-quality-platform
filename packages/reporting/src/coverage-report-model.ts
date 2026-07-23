import type { CoverageFileResult, CoverageRun } from '@cqp/core';

/** Mirrors unit-test-report-model.ts exactly (docs/adr/0019, docs/adr/0024), for CoverageRun instead — docs/adr/0025. */
export interface CoverageReportModel {
  run: Pick<
    CoverageRun,
    | 'id'
    | 'baseRef'
    | 'status'
    | 'gatePassed'
    | 'testsTotal'
    | 'testsPassed'
    | 'testsFailed'
    | 'changedLinesTotal'
    | 'uncoveredLinesTotal'
    | 'completedAt'
  >;
  fileResults: CoverageFileResult[];
  generatedAt: Date;
}

export function buildCoverageReportModel(
  run: CoverageRun,
  fileResults: CoverageFileResult[],
): CoverageReportModel {
  return {
    run: {
      id: run.id,
      baseRef: run.baseRef,
      status: run.status,
      ...(run.gatePassed !== undefined ? { gatePassed: run.gatePassed } : {}),
      ...(run.testsTotal !== undefined ? { testsTotal: run.testsTotal } : {}),
      ...(run.testsPassed !== undefined ? { testsPassed: run.testsPassed } : {}),
      ...(run.testsFailed !== undefined ? { testsFailed: run.testsFailed } : {}),
      ...(run.changedLinesTotal !== undefined ? { changedLinesTotal: run.changedLinesTotal } : {}),
      ...(run.uncoveredLinesTotal !== undefined
        ? { uncoveredLinesTotal: run.uncoveredLinesTotal }
        : {}),
      ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    },
    fileResults,
    generatedAt: new Date(),
  };
}
