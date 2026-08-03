import type {
  QaAutomationStagingSchedule,
  QaAutomationStagingScheduleRepository,
  UpdateQaAutomationStagingScheduleInput,
} from '@cqp/core';

export class UpdateQaAutomationStagingScheduleUseCase {
  constructor(private readonly scheduleRepository: QaAutomationStagingScheduleRepository) {}

  async execute(
    orgId: string,
    input: UpdateQaAutomationStagingScheduleInput,
  ): Promise<QaAutomationStagingSchedule> {
    return this.scheduleRepository.update(orgId, input);
  }
}
