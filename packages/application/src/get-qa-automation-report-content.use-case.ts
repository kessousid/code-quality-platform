import type { ObjectStorage, QaAutomationReport } from '@cqp/core';
import { GetQaAutomationReportUseCase } from './get-qa-automation-report.use-case.js';

export interface QaAutomationReportContent {
  report: QaAutomationReport;
  content: Buffer;
}

/** Mirrors GetUnitTestReportContentUseCase — metadata vs. raw bytes are different concerns. */
export class GetQaAutomationReportContentUseCase {
  constructor(
    private readonly getQaAutomationReportUseCase: GetQaAutomationReportUseCase,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(orgId: string, reportId: string): Promise<QaAutomationReportContent> {
    const report = await this.getQaAutomationReportUseCase.execute(orgId, reportId);
    const content = await this.objectStorage.get(report.storageKey);
    return { report, content };
  }
}
