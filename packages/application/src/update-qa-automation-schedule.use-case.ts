import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

export class InvalidScheduleIntervalError extends Error {
  constructor(intervalHours: number) {
    super(`Interval must be a positive number of hours, got: ${intervalHours}`);
    this.name = 'InvalidScheduleIntervalError';
  }
}

export class UpdateQaAutomationScheduleUseCase {
  constructor(private readonly scheduleRepository: QaAutomationScheduleRepository) {}

  async execute(
    orgId: string,
    input: UpdateQaAutomationScheduleInput,
  ): Promise<QaAutomationSchedule> {
    if (input.intervalHours !== undefined && input.intervalHours <= 0) {
      throw new InvalidScheduleIntervalError(input.intervalHours);
    }
    return this.scheduleRepository.update(orgId, input);
  }
}
