import type { PrismaClient } from '@prisma/client';
import type { ApiTokenRepository, ApiTokenValidationResult, CreateApiTokenInput } from '@cqp/core';

export class PrismaApiTokenRepository implements ApiTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateApiTokenInput): Promise<{ id: string }> {
    const row = await this.prisma.apiToken.create({
      data: { orgId: input.orgId, name: input.name, tokenHash: input.tokenHash },
    });
    return { id: row.id };
  }

  async findActiveByHash(tokenHash: string): Promise<ApiTokenValidationResult | null> {
    const row = await this.prisma.apiToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    return row ? { tokenId: row.id, orgId: row.orgId } : null;
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date() },
    });
  }

  async revokeAllByName(orgId: string, name: string): Promise<void> {
    await this.prisma.apiToken.updateMany({
      where: { orgId, name, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
