import type { ObjectStorage, Report } from '@cqp/core';
import { GetReportUseCase } from './get-report.use-case.js';

export interface ReportContent {
  report: Report;
  content: Buffer;
}

/** Separate from `GetReportUseCase` on purpose — metadata vs. raw bytes are different concerns (see docs/adr/0019). */
export class GetReportContentUseCase {
  constructor(
    private readonly getReportUseCase: GetReportUseCase,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(orgId: string, reportId: string): Promise<ReportContent> {
    const report = await this.getReportUseCase.execute(orgId, reportId);
    const content = await this.objectStorage.get(report.storageKey);
    return { report, content };
  }
}
