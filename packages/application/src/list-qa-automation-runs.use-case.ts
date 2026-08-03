import type {
  PaginatedResult,
  PaginationParams,
  QaAutomationEnvironment,
  QaAutomationRun,
  QaAutomationRunRepository,
} from '@cqp/core';

export class ListQaAutomationRunsUseCase {
  constructor(private readonly runRepository: QaAutomationRunRepository) {}

  async execute(
    orgId: string,
    pagination: PaginationParams,
    environment?: QaAutomationEnvironment,
  ): Promise<PaginatedResult<QaAutomationRun>> {
    return this.runRepository.list(orgId, pagination, environment);
  }
}
