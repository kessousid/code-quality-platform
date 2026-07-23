import type { CoverageReport, CoverageReportRepository } from '@cqp/core';

export class CoverageReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`CoverageReport not found: ${reportId}`);
    this.name = 'CoverageReportNotFoundError';
  }
}

export class GetCoverageReportUseCase {
  constructor(private readonly coverageReportRepository: CoverageReportRepository) {}

  async execute(orgId: string, reportId: string): Promise<CoverageReport> {
    const report = await this.coverageReportRepository.findById(orgId, reportId);
    if (!report) {
      throw new CoverageReportNotFoundError(reportId);
    }
    return report;
  }
}
