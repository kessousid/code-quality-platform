import type { ObjectStorage, UnitTestReport } from '@cqp/core';
import { GetUnitTestReportUseCase } from './get-unit-test-report.use-case.js';

export interface UnitTestReportContent {
  report: UnitTestReport;
  content: Buffer;
}

/** Mirrors GetReportContentUseCase — metadata vs. raw bytes are different concerns (docs/adr/0019, docs/adr/0024). */
export class GetUnitTestReportContentUseCase {
  constructor(
    private readonly getUnitTestReportUseCase: GetUnitTestReportUseCase,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(orgId: string, reportId: string): Promise<UnitTestReportContent> {
    const report = await this.getUnitTestReportUseCase.execute(orgId, reportId);
    const content = await this.objectStorage.get(report.storageKey);
    return { report, content };
  }
}
