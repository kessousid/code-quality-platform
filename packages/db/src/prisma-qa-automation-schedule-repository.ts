import type { PrismaClient } from '@prisma/client';
import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

const DEFAULT_INTERVAL_HOURS = 12;

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0035).
 * Single row per org — `get` lazily creates the default row the first
 * time an org is asked for its schedule, so callers never see "not found".
 */
export class PrismaQaAutomationScheduleRepository implements QaAutomationScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(orgId: string): Promise<QaAutomationSchedule> {
    const row = await this.prisma.qaAutomationSchedule.upsert({
      where: { orgId },
      create: { orgId, intervalHours: DEFAULT_INTERVAL_HOURS, enabled: true },
      update: {},
    });
    return this.toDomain(row);
  }

  async update(
    orgId: string,
    input: UpdateQaAutomationScheduleInput,
  ): Promise<QaAutomationSchedule> {
    const row = await this.prisma.qaAutomationSchedule.upsert({
      where: { orgId },
      create: {
        orgId,
        intervalHours: input.intervalHours ?? DEFAULT_INTERVAL_HOURS,
        enabled: input.enabled ?? true,
        ...(input.lastDailyCheckAt !== undefined
          ? { lastDailyCheckAt: input.lastDailyCheckAt }
          : {}),
      },
      update: {
        ...(input.intervalHours !== undefined ? { intervalHours: input.intervalHours } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.lastDailyCheckAt !== undefined
          ? { lastDailyCheckAt: input.lastDailyCheckAt }
          : {}),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    intervalHours: number;
    enabled: boolean;
    lastDailyCheckAt: Date | null;
  }): QaAutomationSchedule {
    return {
      intervalHours: row.intervalHours,
      enabled: row.enabled,
      ...(row.lastDailyCheckAt !== null ? { lastDailyCheckAt: row.lastDailyCheckAt } : {}),
    };
  }
}
