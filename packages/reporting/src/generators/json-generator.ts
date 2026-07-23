import type { ReportGenerator } from '../generator.js';
import type { ReportModel } from '../report-model.js';

/** The full `ReportModel` as-is — no surprises, no reshaping. */
export class JsonReportGenerator implements ReportGenerator {
  readonly format = 'json' as const;

  async generate(model: ReportModel): Promise<string> {
    return JSON.stringify({ schemaVersion: 1, ...model }, null, 2);
  }
}
