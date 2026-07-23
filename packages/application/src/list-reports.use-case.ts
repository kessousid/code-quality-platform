import type { Report, ReportRepository } from '@cqp/core';

export class ListReportsByScanUseCase {
  constructor(private readonly reportRepository: ReportRepository) {}

  async execute(orgId: string, scanId: string): Promise<Report[]> {
    return this.reportRepository.listByScan(orgId, scanId);
  }
}
