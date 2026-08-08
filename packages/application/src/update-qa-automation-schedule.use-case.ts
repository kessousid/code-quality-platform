import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

export class UpdateQaAutomationScheduleUseCase {
  constructor(private readonly scheduleRepository: QaAutomationScheduleRepository) {}

  async execute(
    orgId: string,
    input: UpdateQaAutomationScheduleInput,
  ): Promise<QaAutomationSchedule> {
    return this.scheduleRepository.update(orgId, input);
  }
}
