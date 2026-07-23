import type { UnitTestReport, UnitTestReportRepository } from '@cqp/core';

export class UnitTestReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`UnitTestReport not found: ${reportId}`);
    this.name = 'UnitTestReportNotFoundError';
  }
}

export class GetUnitTestReportUseCase {
  constructor(private readonly unitTestReportRepository: UnitTestReportRepository) {}

  async execute(orgId: string, reportId: string): Promise<UnitTestReport> {
    const report = await this.unitTestReportRepository.findById(orgId, reportId);
    if (!report) {
      throw new UnitTestReportNotFoundError(reportId);
    }
    return report;
  }
}
