import type { CoverageReport, ObjectStorage } from '@cqp/core';
import { GetCoverageReportUseCase } from './get-coverage-report.use-case.js';

export interface CoverageReportContent {
  report: CoverageReport;
  content: Buffer;
}

/** Mirrors GetUnitTestReportContentUseCase — metadata vs. raw bytes are different concerns (docs/adr/0019, docs/adr/0024, docs/adr/0025). */
export class GetCoverageReportContentUseCase {
  constructor(
    private readonly getCoverageReportUseCase: GetCoverageReportUseCase,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(orgId: string, reportId: string): Promise<CoverageReportContent> {
    const report = await this.getCoverageReportUseCase.execute(orgId, reportId);
    const content = await this.objectStorage.get(report.storageKey);
    return { report, content };
  }
}
