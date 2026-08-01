import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

const DEFAULT_INTERVAL_HOURS = 12;

export class InMemoryQaAutomationScheduleRepository implements QaAutomationScheduleRepository {
  private readonly schedules = new Map<string, QaAutomationSchedule>();

  async get(orgId: string): Promise<QaAutomationSchedule> {
    let schedule = this.schedules.get(orgId);
    if (!schedule) {
      schedule = { intervalHours: DEFAULT_INTERVAL_HOURS, enabled: true };
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
      intervalHours: input.intervalHours ?? existing.intervalHours,
      enabled: input.enabled ?? existing.enabled,
      ...(input.lastDailyCheckAt !== undefined
        ? { lastDailyCheckAt: input.lastDailyCheckAt }
        : existing.lastDailyCheckAt !== undefined
          ? { lastDailyCheckAt: existing.lastDailyCheckAt }
          : {}),
    };
    this.schedules.set(orgId, updated);
    return updated;
  }
}
