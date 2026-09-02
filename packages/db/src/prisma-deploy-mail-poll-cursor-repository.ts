import type { PrismaClient } from '@prisma/client';
import type { DeployMailPollCursor, DeployMailPollCursorRepository } from '@cqp/core';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0058).
 * Single row per org — `get` lazily creates the default row (lastPolledAt:
 * null) the first time an org is polled, mirroring
 * PrismaQaAutomationScheduleRepository's same lazy-create shape.
 */
export class PrismaDeployMailPollCursorRepository implements DeployMailPollCursorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(orgId: string): Promise<DeployMailPollCursor> {
    const row = await this.prisma.deployMailPollCursor.upsert({
      where: { orgId },
      create: { orgId, lastPolledAt: null },
      update: {},
    });
    return this.toDomain(row);
  }

  async updateLastPolledAt(orgId: string, lastPolledAt: Date): Promise<DeployMailPollCursor> {
    const row = await this.prisma.deployMailPollCursor.upsert({
      where: { orgId },
      create: { orgId, lastPolledAt },
      update: { lastPolledAt },
    });
    return this.toDomain(row);
  }

  private toDomain(row: { lastPolledAt: Date | null }): DeployMailPollCursor {
    return { lastPolledAt: row.lastPolledAt };
  }
}
