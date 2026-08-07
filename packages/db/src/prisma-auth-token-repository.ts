import type { PrismaClient } from '@prisma/client';
import type {
  AuthToken,
  AuthTokenPurpose,
  AuthTokenRepository,
  CreateAuthTokenInput,
} from '@cqp/core';
import { authTokenPurposeFromDb, authTokenPurposeToDb } from './mappers.js';

export class PrismaAuthTokenRepository implements AuthTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthTokenInput): Promise<AuthToken> {
    const row = await this.prisma.authToken.create({
      data: {
        userId: input.userId,
        purpose: authTokenPurposeToDb(input.purpose),
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
    return this.toDomain(row);
  }

  async findActiveByHash(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const row = await this.prisma.authToken.findFirst({
      where: {
        tokenHash,
        purpose: authTokenPurposeToDb(purpose),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return row ? this.toDomain(row) : null;
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.authToken.update({ where: { id }, data: { usedAt: new Date() } });
  }

  async invalidateAllForUser(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    await this.prisma.authToken.updateMany({
      where: { userId, purpose: authTokenPurposeToDb(purpose), usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private toDomain(row: {
    id: string;
    userId: string;
    purpose: Parameters<typeof authTokenPurposeFromDb>[0];
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): AuthToken {
    return {
      id: row.id,
      userId: row.userId,
      purpose: authTokenPurposeFromDb(row.purpose),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      ...(row.usedAt !== null ? { usedAt: row.usedAt } : {}),
      createdAt: row.createdAt,
    };
  }
}
