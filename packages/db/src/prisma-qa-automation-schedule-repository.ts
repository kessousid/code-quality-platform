import type { PrismaClient } from '@prisma/client';
import type {
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
  UpdateQaAutomationScheduleInput,
} from '@cqp/core';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0035,
 * docs/adr/0042). Single row per org — `get` lazily creates the default
 * row the first time an org is asked for its schedule, so callers never
 * see "not found".
 */
export class PrismaQaAutomationScheduleRepository implements QaAutomationScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(orgId: string): Promise<QaAutomationSchedule> {
    const row = await this.prisma.qaAutomationSchedule.upsert({
      where: { orgId },
      create: { orgId, enabled: true },
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
      create: { orgId, enabled: input.enabled ?? true },
      update: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: { enabled: boolean }): QaAutomationSchedule {
    return { enabled: row.enabled };
  }
}
