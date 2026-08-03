import type { QaAutomationStagingSchedule, QaAutomationStagingScheduleRepository } from '@cqp/core';

export class GetQaAutomationStagingScheduleUseCase {
  constructor(private readonly scheduleRepository: QaAutomationStagingScheduleRepository) {}

  async execute(orgId: string): Promise<QaAutomationStagingSchedule> {
    return this.scheduleRepository.get(orgId);
  }
}
