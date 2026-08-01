import type { QaAutomationReport, QaAutomationReportRepository } from '@cqp/core';

export class ListQaAutomationReportsByRunUseCase {
  constructor(private readonly qaAutomationReportRepository: QaAutomationReportRepository) {}

  async execute(orgId: string, runId: string): Promise<QaAutomationReport[]> {
    return this.qaAutomationReportRepository.listByRun(orgId, runId);
  }
}
