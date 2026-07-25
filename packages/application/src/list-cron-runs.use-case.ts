import type { CronRun, CronRunRepository, PaginatedResult, PaginationParams } from '@cqp/core';

export class ListCronRunsUseCase {
  constructor(private readonly cronRunRepository: CronRunRepository) {}

  async execute(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<CronRun>> {
    return this.cronRunRepository.list(orgId, pagination);
  }
}
