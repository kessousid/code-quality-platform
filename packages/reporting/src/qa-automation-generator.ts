import type { QaAutomationReportFormat } from '@cqp/core';
import type { QaAutomationReportModel } from './qa-automation-report-model.js';

export type { QaAutomationReportFormat };

/** Mirrors unit-test-generator.ts exactly, for QaAutomationRun instead of UnitTestRun. */
export interface QaAutomationReportGenerator {
  readonly format: QaAutomationReportFormat;
  generate(model: QaAutomationReportModel): Promise<Buffer>;
}
