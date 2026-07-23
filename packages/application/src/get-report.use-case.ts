import type { Report, ReportRepository } from '@cqp/core';

export class ReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`Report not found: ${reportId}`);
    this.name = 'ReportNotFoundError';
  }
}

export class GetReportUseCase {
  constructor(private readonly reportRepository: ReportRepository) {}

  async execute(orgId: string, reportId: string): Promise<Report> {
    const report = await this.reportRepository.findById(orgId, reportId);
    if (!report) {
      throw new ReportNotFoundError(reportId);
    }
    return report;
  }
}
