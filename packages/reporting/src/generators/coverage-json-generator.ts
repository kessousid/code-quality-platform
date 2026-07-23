import type { CoverageReportGenerator } from '../coverage-generator.js';
import type { CoverageReportModel } from '../coverage-report-model.js';

/** The full `CoverageReportModel` as-is — mirrors JsonUnitTestReportGenerator. */
export class JsonCoverageReportGenerator implements CoverageReportGenerator {
  readonly format = 'json' as const;

  async generate(model: CoverageReportModel): Promise<string> {
    return JSON.stringify({ schemaVersion: 1, ...model }, null, 2);
  }
}
