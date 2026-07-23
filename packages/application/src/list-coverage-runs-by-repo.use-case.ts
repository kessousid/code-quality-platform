import type {
  CoverageRun,
  CoverageRunRepository,
  PaginatedResult,
  PaginationParams,
} from '@cqp/core';

export class ListCoverageRunsByRepoUseCase {
  constructor(private readonly coverageRunRepository: CoverageRunRepository) {}

  async execute(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CoverageRun>> {
    return this.coverageRunRepository.listByRepo(orgId, repoId, pagination);
  }
}
