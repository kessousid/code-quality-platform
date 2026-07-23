import type { UnitTestRun, UnitTestRunRepository } from '@cqp/core';

export class UnitTestRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`UnitTestRun not found: ${runId}`);
    this.name = 'UnitTestRunNotFoundError';
  }
}

export class GetUnitTestRunUseCase {
  constructor(private readonly unitTestRunRepository: UnitTestRunRepository) {}

  async execute(orgId: string, runId: string): Promise<UnitTestRun> {
    const run = await this.unitTestRunRepository.findById(orgId, runId);
    if (!run) {
      throw new UnitTestRunNotFoundError(runId);
    }
    return run;
  }
}
