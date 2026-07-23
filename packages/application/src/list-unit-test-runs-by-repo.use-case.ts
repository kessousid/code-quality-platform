import type {
  PaginatedResult,
  PaginationParams,
  UnitTestRun,
  UnitTestRunRepository,
} from '@cqp/core';

export class ListUnitTestRunsByRepoUseCase {
  constructor(private readonly unitTestRunRepository: UnitTestRunRepository) {}

  async execute(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<UnitTestRun>> {
    return this.unitTestRunRepository.listByRepo(orgId, repoId, pagination);
  }
}
