import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

export class InMemoryQaAutomationScheduleRepository implements QaAutomationScheduleRepository {
  private readonly schedules = new Map<string, QaAutomationSchedule>();

  async get(orgId: string): Promise<QaAutomationSchedule> {
    let schedule = this.schedules.get(orgId);
    if (!schedule) {
      schedule = { enabled: true };
      this.schedules.set(orgId, schedule);
    }
    return schedule;
  }

  async update(
    orgId: string,
    input: UpdateQaAutomationScheduleInput,
  ): Promise<QaAutomationSchedule> {
    const existing = await this.get(orgId);
    const updated: QaAutomationSchedule = {
      enabled: input.enabled ?? existing.enabled,
    };
    this.schedules.set(orgId, updated);
    return updated;
  }
}
