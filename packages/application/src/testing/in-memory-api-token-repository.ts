import { randomUUID } from 'node:crypto';
import type { ApiTokenRepository, ApiTokenValidationResult, CreateApiTokenInput } from '@cqp/core';

interface StoredToken {
  id: string;
  orgId: string;
  name: string;
  tokenHash: string;
  revoked: boolean;
}

export class InMemoryApiTokenRepository implements ApiTokenRepository {
  private readonly tokens: StoredToken[] = [];
  public lastTouchedTokenId: string | undefined;

  async create(input: CreateApiTokenInput): Promise<{ id: string }> {
    const id = randomUUID();
    this.tokens.push({
      id,
      orgId: input.orgId,
      name: input.name,
      tokenHash: input.tokenHash,
      revoked: false,
    });
    return { id };
  }

  async findActiveByHash(tokenHash: string): Promise<ApiTokenValidationResult | null> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash && !t.revoked);
    return token ? { tokenId: token.id, orgId: token.orgId } : null;
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    this.lastTouchedTokenId = tokenId;
  }

  async revokeAllByName(orgId: string, name: string): Promise<void> {
    for (const token of this.tokens) {
      if (token.orgId === orgId && token.name === name) {
        token.revoked = true;
      }
    }
  }

  revoke(tokenId: string): void {
    const token = this.tokens.find((t) => t.id === tokenId);
    if (token) token.revoked = true;
  }
}
