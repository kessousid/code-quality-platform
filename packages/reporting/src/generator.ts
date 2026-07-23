import type { ReportFormat } from '@cqp/core';
import type { ReportModel } from './report-model.js';

export type { ReportFormat };

/** Contract each output-format generator implements — see docs/adr/0019. */
export interface ReportGenerator {
  readonly format: ReportFormat;
  generate(model: ReportModel): Promise<Buffer | string>;
}
