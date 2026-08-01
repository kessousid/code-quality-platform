import type { QaAutomationSchedule, QaAutomationScheduleRepository } from '@cqp/core';

export class GetQaAutomationScheduleUseCase {
  constructor(private readonly scheduleRepository: QaAutomationScheduleRepository) {}

  async execute(orgId: string): Promise<QaAutomationSchedule> {
    return this.scheduleRepository.get(orgId);
  }
}
