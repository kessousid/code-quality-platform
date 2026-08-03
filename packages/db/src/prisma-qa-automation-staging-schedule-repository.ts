import type { PrismaClient } from '@prisma/client';
import type {
  QaAutomationStagingSchedule,
  QaAutomationStagingScheduleRepository,
  UpdateQaAutomationStagingScheduleInput,
} from '@cqp/core';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0036).
 * Single row per org — `get` lazily creates the default row (enabled) the
 * first time an org is asked for its staging schedule, same shape as
 * PrismaQaAutomationScheduleRepository.
 */
export class PrismaQaAutomationStagingScheduleRepository implements QaAutomationStagingScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(orgId: string): Promise<QaAutomationStagingSchedule> {
    const row = await this.prisma.qaAutomationStagingSchedule.upsert({
      where: { orgId },
      create: { orgId, enabled: true },
      update: {},
    });
    return this.toDomain(row);
  }

  async update(
    orgId: string,
    input: UpdateQaAutomationStagingScheduleInput,
  ): Promise<QaAutomationStagingSchedule> {
    const row = await this.prisma.qaAutomationStagingSchedule.upsert({
      where: { orgId },
      create: { orgId, enabled: input.enabled ?? true },
      update: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: { enabled: boolean }): QaAutomationStagingSchedule {
    return { enabled: row.enabled };
  }
}
