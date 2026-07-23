import type { UnitTestReportGenerator } from '../unit-test-generator.js';
import type { UnitTestReportModel } from '../unit-test-report-model.js';

/** The full `UnitTestReportModel` as-is — mirrors JsonReportGenerator. */
export class JsonUnitTestReportGenerator implements UnitTestReportGenerator {
  readonly format = 'json' as const;

  async generate(model: UnitTestReportModel): Promise<string> {
    return JSON.stringify({ schemaVersion: 1, ...model }, null, 2);
  }
}
