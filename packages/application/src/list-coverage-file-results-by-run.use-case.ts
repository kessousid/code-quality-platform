import type { CoverageFileResult, CoverageFileResultRepository } from '@cqp/core';

export class ListCoverageFileResultsByRunUseCase {
  constructor(private readonly coverageFileResultRepository: CoverageFileResultRepository) {}

  async execute(runId: string): Promise<CoverageFileResult[]> {
    return this.coverageFileResultRepository.listByRun(runId);
  }
}
