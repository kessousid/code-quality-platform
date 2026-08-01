import type {
  QaAutomationRun,
  QaAutomationRunRepository,
  QaAutomationTestResult,
  QaAutomationTestResultRepository,
} from '@cqp/core';

export class QaAutomationRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`QaAutomationRun not found: ${runId}`);
    this.name = 'QaAutomationRunNotFoundError';
  }
}

export interface QaAutomationRunWithResults extends QaAutomationRun {
  results: QaAutomationTestResult[];
}

export class GetQaAutomationRunUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly resultRepository: QaAutomationTestResultRepository,
  ) {}

  async execute(orgId: string, runId: string): Promise<QaAutomationRunWithResults> {
    const run = await this.runRepository.findById(orgId, runId);
    if (!run) {
      throw new QaAutomationRunNotFoundError(runId);
    }
    const results = await this.resultRepository.listByRun(run.id);
    return { ...run, results };
  }
}
