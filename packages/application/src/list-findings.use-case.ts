import type {
  Finding,
  FindingFilter,
  FindingRepository,
  PaginatedResult,
  PaginationParams,
} from '@cqp/core';

export class ListFindingsUseCase {
  constructor(private readonly findingRepository: FindingRepository) {}

  async execute(
    orgId: string,
    filter: FindingFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Finding>> {
    return this.findingRepository.list(orgId, filter, pagination);
  }
}
