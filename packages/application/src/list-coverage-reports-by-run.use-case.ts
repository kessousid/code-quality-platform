import type { CoverageReport, CoverageReportRepository } from '@cqp/core';

export class ListCoverageReportsByRunUseCase {
  constructor(private readonly coverageReportRepository: CoverageReportRepository) {}

  async execute(orgId: string, coverageRunId: string): Promise<CoverageReport[]> {
    return this.coverageReportRepository.listByRun(orgId, coverageRunId);
  }
}
