import type { UnitTestReportFormat } from '@cqp/core';
import type { UnitTestReportModel } from './unit-test-report-model.js';

export type { UnitTestReportFormat };

/** Mirrors generator.ts exactly (docs/adr/0019, docs/adr/0024). */
export interface UnitTestReportGenerator {
  readonly format: UnitTestReportFormat;
  generate(model: UnitTestReportModel): Promise<Buffer | string>;
}
