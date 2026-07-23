import type { UnitTestReport, UnitTestReportRepository } from '@cqp/core';

export class ListUnitTestReportsByRunUseCase {
  constructor(private readonly unitTestReportRepository: UnitTestReportRepository) {}

  async execute(orgId: string, unitTestRunId: string): Promise<UnitTestReport[]> {
    return this.unitTestReportRepository.listByRun(orgId, unitTestRunId);
  }
}
