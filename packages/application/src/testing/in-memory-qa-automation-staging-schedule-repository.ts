import type {
  QaAutomationStagingSchedule,
  QaAutomationStagingScheduleRepository,
  UpdateQaAutomationStagingScheduleInput,
} from '@cqp/core';

export class InMemoryQaAutomationStagingScheduleRepository implements QaAutomationStagingScheduleRepository {
  private readonly schedules = new Map<string, QaAutomationStagingSchedule>();

  async get(orgId: string): Promise<QaAutomationStagingSchedule> {
    let schedule = this.schedules.get(orgId);
    if (!schedule) {
      schedule = { enabled: true };
      this.schedules.set(orgId, schedule);
    }
    return schedule;
  }

  async update(
    orgId: string,
    input: UpdateQaAutomationStagingScheduleInput,
  ): Promise<QaAutomationStagingSchedule> {
    const existing = await this.get(orgId);
    const updated: QaAutomationStagingSchedule = {
      enabled: input.enabled ?? existing.enabled,
    };
    this.schedules.set(orgId, updated);
    return updated;
  }
}
