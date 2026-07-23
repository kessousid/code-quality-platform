import type { CoverageRun, CoverageRunRepository } from '@cqp/core';

export class CoverageRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`CoverageRun not found: ${runId}`);
    this.name = 'CoverageRunNotFoundError';
  }
}

export class GetCoverageRunUseCase {
  constructor(private readonly coverageRunRepository: CoverageRunRepository) {}

  async execute(orgId: string, runId: string): Promise<CoverageRun> {
    const run = await this.coverageRunRepository.findById(orgId, runId);
    if (!run) {
      throw new CoverageRunNotFoundError(runId);
    }
    return run;
  }
}
