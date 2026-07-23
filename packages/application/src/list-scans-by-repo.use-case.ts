import type { PaginatedResult, PaginationParams, Scan, ScanRepository } from '@cqp/core';

/** Powers the dashboard's scan history / trends view (Phase 10). */
export class ListScansByRepoUseCase {
  constructor(private readonly scanRepository: ScanRepository) {}

  async execute(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Scan>> {
    return this.scanRepository.listByRepo(orgId, repoId, pagination);
  }
}
