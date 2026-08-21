import type { PrismaClient } from '@prisma/client';
import type { OneDriveConnection, OneDriveConnectionRepository } from '@cqp/core';

/** Infrastructure adapter (ADR-0010) — single row per org, same upsert shape as PrismaQaAutomationScheduleRepository. */
export class PrismaOneDriveConnectionRepository implements OneDriveConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(
    orgId: string,
    encryptedRefreshToken: string,
    accountEmail?: string,
  ): Promise<OneDriveConnection> {
    const row = await this.prisma.oneDriveConnection.upsert({
      where: { orgId },
      create: { orgId, encryptedRefreshToken, accountEmail: accountEmail ?? null },
      update: { encryptedRefreshToken, accountEmail: accountEmail ?? null },
    });
    return this.toDomain(row);
  }

  async find(orgId: string): Promise<OneDriveConnection | null> {
    const row = await this.prisma.oneDriveConnection.findUnique({ where: { orgId } });
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: {
    orgId: string;
    encryptedRefreshToken: string;
    accountEmail: string | null;
    updatedAt: Date;
  }): OneDriveConnection {
    return {
      orgId: row.orgId,
      encryptedRefreshToken: row.encryptedRefreshToken,
      ...(row.accountEmail !== null ? { accountEmail: row.accountEmail } : {}),
      updatedAt: row.updatedAt,
    };
  }
}
