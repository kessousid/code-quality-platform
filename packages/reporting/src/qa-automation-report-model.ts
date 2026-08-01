import type { QaAutomationRun, QaAutomationTestResult } from '@cqp/core';

/** Mirrors unit-test-report-model.ts exactly, for QaAutomationRun instead of UnitTestRun. */
export interface QaAutomationReportModel {
  run: Pick<QaAutomationRun, 'id' | 'status' | 'triggeredBy' | 'startedAt' | 'completedAt'>;
  results: QaAutomationTestResult[];
  generatedAt: Date;
}

export function buildQaAutomationReportModel(
  run: QaAutomationRun,
  results: QaAutomationTestResult[],
): QaAutomationReportModel {
  return {
    run: {
      id: run.id,
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt,
      ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    },
    results,
    generatedAt: new Date(),
  };
}
