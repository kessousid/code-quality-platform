import type {
  PaginatedResult,
  PaginationParams,
  QaAutomationRun,
  QaAutomationRunRepository,
} from '@cqp/core';

export class ListQaAutomationRunsUseCase {
  constructor(private readonly runRepository: QaAutomationRunRepository) {}

  async execute(
    orgId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<QaAutomationRun>> {
    return this.runRepository.list(orgId, pagination);
  }
}
