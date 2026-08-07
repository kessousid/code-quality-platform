import { randomUUID } from 'node:crypto';
import type {
  AuthToken,
  AuthTokenPurpose,
  AuthTokenRepository,
  CreateAuthTokenInput,
} from '@cqp/core';

export class InMemoryAuthTokenRepository implements AuthTokenRepository {
  private readonly tokens: AuthToken[] = [];

  async create(input: CreateAuthTokenInput): Promise<AuthToken> {
    const token: AuthToken = {
      id: randomUUID(),
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    };
    this.tokens.push(token);
    return token;
  }

  async findActiveByHash(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const now = new Date();
    return (
      this.tokens.find(
        (t) =>
          t.tokenHash === tokenHash &&
          t.purpose === purpose &&
          t.usedAt === undefined &&
          t.expiresAt > now,
      ) ?? null
    );
  }

  async markUsed(id: string): Promise<void> {
    const token = this.tokens.find((t) => t.id === id);
    if (token) token.usedAt = new Date();
  }

  async invalidateAllForUser(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    const now = new Date();
    for (const token of this.tokens) {
      if (token.userId === userId && token.purpose === purpose && token.usedAt === undefined) {
        token.usedAt = now;
      }
    }
  }
}
