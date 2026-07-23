import type { CoverageReportFormat } from '@cqp/core';
import type { CoverageReportModel } from './coverage-report-model.js';

export type { CoverageReportFormat };

/** Mirrors unit-test-generator.ts exactly (docs/adr/0019, docs/adr/0024, docs/adr/0025). */
export interface CoverageReportGenerator {
  readonly format: CoverageReportFormat;
  generate(model: CoverageReportModel): Promise<Buffer | string>;
}
