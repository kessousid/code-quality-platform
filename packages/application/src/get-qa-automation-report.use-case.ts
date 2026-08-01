import type { QaAutomationReport, QaAutomationReportRepository } from '@cqp/core';

export class QaAutomationReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`QaAutomationReport not found: ${reportId}`);
    this.name = 'QaAutomationReportNotFoundError';
  }
}

export class GetQaAutomationReportUseCase {
  constructor(private readonly qaAutomationReportRepository: QaAutomationReportRepository) {}

  async execute(orgId: string, reportId: string): Promise<QaAutomationReport> {
    const report = await this.qaAutomationReportRepository.findById(orgId, reportId);
    if (!report) {
      throw new QaAutomationReportNotFoundError(reportId);
    }
    return report;
  }
}
